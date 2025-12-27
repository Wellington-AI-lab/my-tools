import type { TrendsReport } from '@/modules/trends/types';
import { kvGetJson, kvPutJson } from '@/lib/kv-json';
import type { AliasRule } from '@/modules/trends/normalize';

const KEY_PREFIX = 'trends:daily';
const KEY_LATEST = 'trends:latest';
const KEY_INDEX = 'trends:index';
const KEY_ALIASES = 'trends:aliases';

export function trendsDayKey(dayKey: string): string {
  return `${KEY_PREFIX}:${dayKey}`;
}

export async function putTrendsReport(kv: KVNamespace, report: TrendsReport): Promise<void> {
  const dayKey = String(report?.meta?.day_key || '').trim();
  if (!dayKey) throw new Error('report.meta.day_key is missing');
  const ttl = 60 * 60 * 24 * 14; // keep 14 days

  await kvPutJson(kv, trendsDayKey(dayKey), report, ttl);
  await kvPutJson(kv, KEY_LATEST, report, ttl);

  // Maintain an index of recent day keys (no KV list dependency).
  const current = await kvGetJson<string[]>(kv, KEY_INDEX, []);
  const next = [dayKey, ...current.filter((k) => k !== dayKey)].slice(0, 14);
  await kvPutJson(kv, KEY_INDEX, next, ttl);
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


