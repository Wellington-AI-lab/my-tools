import type { TrendRawItem, TrendsReport } from '@/modules/trends/types';
import { ALL_THEMES } from '@/modules/trends/themes';
import { fetchGoogleTrendsDailyRss } from '@/modules/trends/sources/google-trends-rss';
import { fetchWeiboHotSummary } from '@/modules/trends/sources/weibo-hot';
import { fetchTrendsMock } from '@/modules/trends/sources/mock';
import { filterAndGroupTrends } from '@/modules/trends/pipeline/filter';
import { reasonTrends } from '@/modules/trends/pipeline/reason';
import { nowIso } from '@/modules/trends/utils';

function dayKeyShanghai(d = new Date()): string {
  // Convert to Asia/Shanghai date without depending on Intl timeZone support differences.
  const sh = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return sh.toISOString().slice(0, 10);
}

export async function runTrendsAgent(opts: {
  env: { LLM_BASE_URL?: string; LLM_API_KEY?: string; LLM_MODEL?: string };
  minScore?: number;
  dedupSimilarity?: number;
}): Promise<TrendsReport> {
  const started = Date.now();
  const logs: TrendsReport['logs'] = [];
  const log = (stage: 'fetch' | 'filter' | 'reason' | 'store', message: string) => {
    logs.push({ ts: nowIso(), stage, message });
  };

  const dayKey = dayKeyShanghai();
  const raw: TrendRawItem[] = [];
  const sourcesUsed: Array<'google_trends_rss' | 'weibo_hot' | 'mock'> = [];
  const sourceStatus: NonNullable<TrendsReport['meta']['source_status']> = {};

  log('fetch', 'Fetching Google Trends daily RSS (CN + US)…');
  try {
    const [cn, us] = await Promise.all([
      fetchGoogleTrendsDailyRss({ geo: 'CN', hl: 'zh-CN' }),
      fetchGoogleTrendsDailyRss({ geo: 'US', hl: 'en-US' }),
    ]);
    raw.push(...(cn.items || []), ...(us.items || []));
    sourcesUsed.push('google_trends_rss');
    const n = (cn.items?.length ?? 0) + (us.items?.length ?? 0);
    sourceStatus.google_trends_rss = { ok: n > 0, items: n };
    log('fetch', `Google Trends RSS ok: +${n} items.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sourceStatus.google_trends_rss = { ok: false, items: 0, error: msg };
    log('fetch', `Google Trends RSS failed: ${msg}`);
  }

  log('fetch', 'Fetching Weibo hot summary…');
  try {
    const wb = await fetchWeiboHotSummary();
    raw.push(...(wb.items || []));
    sourcesUsed.push('weibo_hot');
    const n = wb.items?.length ?? 0;
    sourceStatus.weibo_hot = { ok: n > 0, items: n };
    log('fetch', `Weibo ok: +${n} items.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sourceStatus.weibo_hot = { ok: false, items: 0, error: msg };
    log('fetch', `Weibo failed: ${msg}`);
  }

  if (raw.length === 0) {
    log('fetch', 'All sources failed; falling back to mock.');
    const mock = await fetchTrendsMock();
    raw.push(...(mock.items || []));
    sourcesUsed.push('mock');
    sourceStatus.mock = { ok: (mock.items?.length ?? 0) > 0, items: mock.items?.length ?? 0 };
  }

  log('filter', 'Filtering + dedup + theme tagging…');
  const filtered = filterAndGroupTrends(raw, {
    minScore: Number.isFinite(opts.minScore) ? Number(opts.minScore) : 60,
    dedupTitleSimilarity: Number.isFinite(opts.dedupSimilarity) ? Number(opts.dedupSimilarity) : 0.66,
    maxPerTheme: 12,
    maxTotal: 150,
  });

  log(
    'filter',
    `Scanned ${filtered.scanned}. After score filter: ${filtered.keptAfterScore}. After dedup: ${filtered.keptAfterDedup}.`
  );

  log('reason', 'Generating daily insight (LLM if configured, otherwise mock)…');
  const reasoning = await reasonTrends({
    env: opts.env,
    byTheme: filtered.byTheme,
    sourcesUsed,
    dayKey,
  });
  log('reason', `Reasoning used: ${reasoning.used}.`);

  const trendsByTheme: TrendsReport['trends_by_theme'] = [];
  for (const theme of ALL_THEMES) {
    const cards = filtered.byTheme.get(theme) ?? [];
    if (!cards.length) continue;
    const keywords = reasoning.byThemeKeywords.get(theme) ?? [];
    trendsByTheme.push({ theme, keywords, cards });
  }

  return {
    meta: {
      generated_at: nowIso(),
      day_key: dayKey,
      sources_used: Array.from(new Set(sourcesUsed)),
      source_status: sourceStatus,
      items_scanned: filtered.scanned,
      items_kept: trendsByTheme.reduce((n, g) => n + g.cards.length, 0),
      execution_time_ms: Math.max(0, Date.now() - started),
      llm_used: reasoning.used,
    },
    logs,
    trends_by_theme: trendsByTheme,
    insight_markdown: reasoning.insight,
  };
}


