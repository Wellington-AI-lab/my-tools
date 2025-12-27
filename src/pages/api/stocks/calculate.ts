import type { APIRoute } from 'astro';
import { z } from 'zod';
import { isValid, parseISO } from 'date-fns';
import { getEnv, getKV } from '@/lib/env';
import { normalizeAndValidateSymbol } from '@/lib/validation';
import { fetchDailySeriesWithCache } from '@/modules/stocks/providers';
import { runBacktest } from '@/modules/stocks/backtest';

// 日期验证：格式正确且为有效日期（如 2024-02-30 无效）
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (val) => isValid(parseISO(val)),
  { message: 'Invalid date' }
);

export const POST: APIRoute = async (context) => {
  const schema = z.object({
    weights: z.array(
      z.object({
        symbol: z.string(),
        weight: z.number().finite().min(0),
      })
    ),
    startDate: dateSchema,
    endDate: dateSchema,
  });

  try {
    const body = schema.safeParse(await context.request.json().catch(() => ({})));
    if (!body.success) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const MIN_DATE = '2000-01-01'; // 最早日期限制
    
    const startDate = body.data.startDate;
    const endDate = body.data.endDate;
    
    if (startDate < MIN_DATE) {
      return new Response(JSON.stringify({ error: `开始日期不能早于 ${MIN_DATE}` }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    
    if (endDate < MIN_DATE) {
      return new Response(JSON.stringify({ error: `结束日期不能早于 ${MIN_DATE}` }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    
    if (startDate > endDate) {
      return new Response(JSON.stringify({ error: 'startDate must be <= endDate' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Normalize symbols + drop invalid
    const weights = body.data.weights
      .map((w) => ({ symbol: normalizeAndValidateSymbol(w.symbol), weight: w.weight }))
      .filter((w) => w.symbol && w.weight >= 0) as Array<{ symbol: string; weight: number }>;

    if (weights.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one valid symbol is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const env = getEnv(context.locals) as any;
    const kv = getKV(context.locals);
    // Yahoo Finance 优先（免费且有完整历史数据），其他作为备用
    const providers: Array<'yahoo' | 'finnhub' | 'fmp' | 'polygon'> = ['yahoo', 'finnhub', 'fmp', 'polygon'];

    const seriesBySymbol: Record<string, any[]> = {};
    const providerBySymbol: Record<string, string> = {};
    const notes: string[] = [];
    let cacheHits = 0;

    // Fetch all series in parallel (bounded by symbol count <= ~20 typical).
    await Promise.all(
      weights.map(async (w) => {
        const r = await fetchDailySeriesWithCache({
          kv,
          env,
          symbol: w.symbol,
          start: startDate,
          end: endDate,
          providers,
        });
        seriesBySymbol[w.symbol] = r.points;
        providerBySymbol[w.symbol] = r.provider + (r.cacheHit ? ':cache' : '');
        if (r.cacheHit) cacheHits++;
      })
    );

    if (kv) {
      notes.push(`KV 缓存命中：${cacheHits}/${weights.length}`);
    } else {
      notes.push('KV 未绑定：当前为无缓存模式（开发环境可接受，生产建议绑定 KV）。');
    }

    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
      clampYears: 30, // 扩展到 30 年历史数据
      notes,
    });

    // 获取 QQQ 作为基准对比
    let benchmarkSeries: Array<{ date: string; value: number }> | null = null;
    try {
      const benchmarkSymbol = 'QQQ';
      const benchmarkData = await fetchDailySeriesWithCache({
        kv,
        env,
        symbol: benchmarkSymbol,
        start: result.actualStartDate,
        end: result.actualEndDate,
        providers,
      });
      
      if (benchmarkData.points.length > 0) {
        // 计算 QQQ 的净值序列（从 1 开始）
        const firstPrice = benchmarkData.points[0].close;
        const benchmarkDateSet = new Set(result.valueSeries?.map(p => p.date) || []);
        benchmarkSeries = benchmarkData.points
          .filter(p => benchmarkDateSet.has(p.date))
          .map(p => ({
            date: p.date,
            value: p.close / firstPrice,
          }));
      }
    } catch {
      // 基准获取失败不影响主结果
    }

    return new Response(JSON.stringify({ ...result, benchmarkSeries }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};


