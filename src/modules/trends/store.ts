import type { TrendsReport } from '@/modules/trends/types';
import { kvGetJson, kvPutJson } from '@/lib/kv-json';
import type { AliasRule } from '@/modules/trends/normalize';

const KEY_PREFIX = 'trends:daily';
const KEY_LATEST = 'trends:latest';
const KEY_INDEX = 'trends:index';
const KEY_ALIASES = 'trends:aliases';
const KEY_NEWS_KEYWORDS = 'news:keywords:latest';

export function trendsDayKey(dayKey: string): string {
  return `${KEY_PREFIX}:${dayKey}`;
}

/**
 * 从 Trend Radar 报告中提取关键词，供信息流使用
 */
function extractKeywordsForNews(report: TrendsReport): Record<string, string[]> {
  const result: Record<string, string[]> = {
    finance: [],
    economy: [],
    ai: [],
  };

  for (const group of report.trends_by_theme || []) {
    const theme = group.theme;
    // 只处理 finance, economy, ai 三个主题
    if (theme === 'finance' || theme === 'economy' || theme === 'ai') {
      // 从 keywords 提取
      const keywords = (group.keywords || []).slice(0, 10);
      // 从 cards 的标题中提取高频词（可选）
      result[theme] = [...new Set(keywords)];
    }
  }

  // 确保每个主题至少有默认关键词
  if (result.finance.length === 0) {
    result.finance = ['股市', '美股', 'A股', '降息', '美联储'];
  }
  if (result.economy.length === 0) {
    result.economy = ['GDP', 'CPI', '通胀', '就业', '经济'];
  }
  if (result.ai.length === 0) {
    result.ai = ['AI', '人工智能', 'ChatGPT', 'OpenAI', '大模型'];
  }

  return result;
}

export async function putTrendsReport(kv: KVNamespace, report: TrendsReport): Promise<void> {
  const dayKey = String(report?.meta?.day_key || '').trim();
  if (!dayKey) throw new Error('report.meta.day_key is missing');
  const ttl = 60 * 60 * 24 * 14; // keep 14 days

  await kvPutJson(kv, trendsDayKey(dayKey), report, ttl);
  await kvPutJson(kv, KEY_LATEST, report, ttl);

  // ⚠️ RACE CONDITION WARNING: Read-Modify-Write pattern on KEY_INDEX
  // In distributed edge environments, simultaneous scan requests can race to update this index.
  // One request may read stale data, overwrite another's update, causing "lost update".
  // Current mitigation: scan_id deduplication + KV lock reduces but doesn't eliminate this risk.
  // Future: Consider using D1 for index (atomic operations) or accept eventual consistency.
  // TODO: Re-architect to use D1-based index with atomic upsert/append operations.
  const current = await kvGetJson<string[]>(kv, KEY_INDEX, []);
  const next = [dayKey, ...current.filter((k) => k !== dayKey)].slice(0, 14);
  await kvPutJson(kv, KEY_INDEX, next, ttl);

  // 提取关键词供信息流使用
  const keywords = extractKeywordsForNews(report);
  await kvPutJson(kv, KEY_NEWS_KEYWORDS, {
    keywords,
    updatedAt: new Date().toISOString(),
    fromDayKey: dayKey,
  }, ttl);
}

export async function getLatestTrendsReport(kv: KVNamespace): Promise<TrendsReport | null> {
  const empty = null as unknown as TrendsReport | null;
  return await kvGetJson<TrendsReport | null>(kv, KEY_LATEST, empty);
}

export async function getTrendsHistory(kv: KVNamespace, limit = 7): Promise<TrendsReport[]> {
  const idx = await kvGetJson<string[]>(kv, KEY_INDEX, []);
  const keys = idx.slice(0, Math.max(1, Math.min(14, Math.floor(limit || 7))));
  if (keys.length === 0) return [];

  const reports = await Promise.all(
    keys.map(async (dayKey) => {
      const empty = null as unknown as TrendsReport | null;
      const r = await kvGetJson<TrendsReport | null>(kv, trendsDayKey(dayKey), empty);
      return r;
    })
  );
  return reports.filter(Boolean) as TrendsReport[];
}

export async function getTrendsAliases(kv: KVNamespace): Promise<AliasRule[]> {
  return await kvGetJson<AliasRule[]>(kv, KEY_ALIASES, []);
}

export async function putTrendsAliases(kv: KVNamespace, rules: AliasRule[]): Promise<void> {
  const safe = Array.isArray(rules) ? rules : [];
  await kvPutJson(kv, KEY_ALIASES, safe);
}


