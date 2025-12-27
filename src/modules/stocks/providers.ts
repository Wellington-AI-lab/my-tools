import { kvGetJson, kvPutJson } from '@/lib/kv-json';
import type { PricePoint } from '@/modules/stocks/types';

type ProviderName = 'yahoo' | 'finnhub' | 'fmp' | 'polygon';

type ProviderEnv = {
  FINNHUB_API_KEY?: string;
  FMP_API_KEY?: string;
  POLYGON_API_KEY?: string;
};

function toUnixSecondsUTC(dateStr: string, endInclusive = false): number {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (endInclusive) d.setUTCDate(d.getUTCDate() + 1);
  return Math.floor(d.getTime() / 1000);
}

function toIsoDateUTC(tsSeconds: number): string {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10);
}

function toIsoDateFromMsUTC(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(0, 10);
}

function dateToUnixSeconds(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00.000Z`).getTime() / 1000);
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 12_000, extraHeaders?: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { accept: 'application/json', ...extraHeaders };
    const resp = await fetch(url, { signal: ctrl.signal, headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Yahoo Finance - 免费且提供完整历史数据（可追溯到 IPO）
 * 使用 Yahoo Finance Chart API
 */
async function fetchYahooDaily(_env: ProviderEnv, symbol: string, start: string, end: string): Promise<PricePoint[]> {
  const period1 = dateToUnixSeconds(start);
  const period2 = dateToUnixSeconds(end) + 86400; // 包含结束日期
  
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
  
  const json = await fetchJsonWithTimeout(url, 15000, {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });
  
  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error(`Yahoo Finance returned no data for ${symbol}`);
  }
  
  const timestamps: number[] = result.timestamp || [];
  const adjClose: number[] = result.indicators?.adjclose?.[0]?.adjclose || [];
  const close: number[] = result.indicators?.quote?.[0]?.close || [];
  
  if (timestamps.length === 0) {
    throw new Error(`Yahoo Finance returned empty timestamps for ${symbol}`);
  }
  
  const out: PricePoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    // 优先使用调整后收盘价，其次使用普通收盘价
    const price = adjClose[i] ?? close[i];
    if (typeof ts !== 'number' || typeof price !== 'number' || !Number.isFinite(price)) continue;
    out.push({ date: toIsoDateUTC(ts), close: price });
  }
  
  if (out.length === 0) {
    throw new Error(`Yahoo Finance returned no valid price data for ${symbol}`);
  }
  
  return out;
}

async function fetchFinnhubDaily(env: ProviderEnv, symbol: string, start: string, end: string): Promise<PricePoint[]> {
  const token = env.FINNHUB_API_KEY;
  if (!token) throw new Error('FINNHUB_API_KEY missing');
  const from = toUnixSecondsUTC(start, false);
  const to = toUnixSecondsUTC(end, true);
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${encodeURIComponent(token)}`;
  const json = await fetchJsonWithTimeout(url);
  if (!json || json.s !== 'ok' || !Array.isArray(json.t) || !Array.isArray(json.c)) {
    throw new Error(`Finnhub candle not ok for ${symbol}`);
  }
  const out: PricePoint[] = [];
  for (let i = 0; i < json.t.length; i++) {
    const ts = json.t[i];
    const close = json.c[i];
    if (typeof ts !== 'number' || typeof close !== 'number') continue;
    out.push({ date: toIsoDateUTC(ts), close });
  }
  return out;
}

async function fetchFmpDaily(env: ProviderEnv, symbol: string, start: string, end: string): Promise<PricePoint[]> {
  const key = env.FMP_API_KEY;
  if (!key) throw new Error('FMP_API_KEY missing');
  const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(
    symbol
  )}?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}&apikey=${encodeURIComponent(key)}`;
  const json = await fetchJsonWithTimeout(url);
  const historical: Array<{ date: string; adjClose?: number; close?: number }> | undefined = json?.historical;
  if (!historical || !Array.isArray(historical) || historical.length === 0) {
    throw new Error(`FMP returned no data for ${symbol}`);
  }
  // FMP usually returns descending; normalize ascending.
  const out: PricePoint[] = [];
  for (const row of historical) {
    const date = row?.date;
    const price = typeof row?.adjClose === 'number' ? row.adjClose : row?.close;
    if (typeof date !== 'string' || typeof price !== 'number') continue;
    out.push({ date, close: price });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function fetchPolygonDaily(env: ProviderEnv, symbol: string, start: string, end: string): Promise<PricePoint[]> {
  const key = env.POLYGON_API_KEY;
  if (!key) throw new Error('POLYGON_API_KEY missing');
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(
    symbol
  )}/range/1/day/${encodeURIComponent(start)}/${encodeURIComponent(
    end
  )}?adjusted=true&sort=asc&limit=50000&apiKey=${encodeURIComponent(key)}`;
  const json = await fetchJsonWithTimeout(url);
  const results: Array<{ t: number; c: number }> | undefined = json?.results;
  if (!results || !Array.isArray(results) || results.length === 0) {
    throw new Error(`Polygon returned no data for ${symbol}`);
  }
  const out: PricePoint[] = [];
  for (const r of results) {
    if (typeof r?.t !== 'number' || typeof r?.c !== 'number') continue;
    out.push({ date: toIsoDateFromMsUTC(r.t), close: r.c });
  }
  return out;
}

async function fetchFromProvider(
  provider: ProviderName,
  env: ProviderEnv,
  symbol: string,
  start: string,
  end: string
): Promise<PricePoint[]> {
  if (provider === 'yahoo') return await fetchYahooDaily(env, symbol, start, end);
  if (provider === 'finnhub') return await fetchFinnhubDaily(env, symbol, start, end);
  if (provider === 'fmp') return await fetchFmpDaily(env, symbol, start, end);
  return await fetchPolygonDaily(env, symbol, start, end);
}

export async function fetchDailySeriesWithCache(opts: {
  kv: KVNamespace | null;
  env: ProviderEnv;
  symbol: string;
  start: string;
  end: string;
  providers: ProviderName[];
  cacheTtlSeconds?: number;
}): Promise<{ points: PricePoint[]; provider: ProviderName; cacheHit: boolean }> {
  const { kv, env, symbol, start, end, providers } = opts;
  // 24 小时缓存：平衡性能和数据准确性
  // - 分红/拆股后，Yahoo 会重算所有历史 Adjusted Close
  // - 24 小时后缓存过期，自动获取最新调整后数据
  const cacheTtlSeconds = opts.cacheTtlSeconds ?? 60 * 60 * 24;

  const tried: string[] = [];
  let lastErr: unknown = null;

  for (const provider of providers) {
    tried.push(provider);
    const cacheKey = `cache:stocks:candles:v1:${provider}:${symbol}:${start}:${end}`;
    if (kv) {
      const cached = await kvGetJson<PricePoint[]>(kv, cacheKey, []);
      if (Array.isArray(cached) && cached.length > 0) {
        return { points: cached, provider, cacheHit: true };
      }
    }

    try {
      const points = await fetchFromProvider(provider, env, symbol, start, end);
      if (kv && points.length > 0) {
        await kvPutJson(kv, cacheKey, points, cacheTtlSeconds);
      }
      return { points, provider, cacheHit: false };
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  throw new Error(`All providers failed for ${symbol} (${tried.join(' -> ')}): ${String(lastErr)}`);
}


