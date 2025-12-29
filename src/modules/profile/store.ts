import { normalizeAndValidateSymbol } from '@/lib/validation';
import { kvGetJson, kvPutJson } from '@/lib/kv-json';
import type { KVStorage } from '@/lib/storage/kv';

export type WatchlistItem = {
  symbol: string;
  tags: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type TagRule =
  | {
      id: string;
      name: string;
      color?: string;
      rule: { type: 'symbol_in'; symbols: string[] };
    }
  | {
      id: string;
      name: string;
      color?: string;
      rule: { type: 'regex'; pattern: string };
    };

export type Preferences = {
  defaultBacktestYears?: number;
};

const KEY_WATCHLIST = 'profile:v1:watchlist';
const KEY_TAG_RULES = 'profile:v1:tagRules';
const KEY_PREFERENCES = 'profile:v1:preferences';

export async function getWatchlist(kv: KVStorage): Promise<WatchlistItem[]> {
  const items = await kvGetJson<WatchlistItem[]>(kv, KEY_WATCHLIST, []);
  // basic normalization + de-dupe
  const seen = new Set<string>();
  const cleaned: WatchlistItem[] = [];
  for (const item of items) {
    const symbol = normalizeAndValidateSymbol(item?.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    cleaned.push({
      symbol,
      tags: Array.isArray(item?.tags) ? item.tags.filter((t) => typeof t === 'string') : [],
      note: typeof item?.note === 'string' ? item.note : undefined,
      createdAt: typeof item?.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item?.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
    });
  }
  return cleaned;
}

export async function putWatchlist(kv: KVStorage, items: WatchlistItem[]): Promise<void> {
  await kvPutJson(kv, KEY_WATCHLIST, items);
}

export async function getTagRules(kv: KVStorage): Promise<TagRule[]> {
  const rules = await kvGetJson<TagRule[]>(kv, KEY_TAG_RULES, []);
  return Array.isArray(rules) ? rules : [];
}

export async function putTagRules(kv: KVStorage, rules: TagRule[]): Promise<void> {
  await kvPutJson(kv, KEY_TAG_RULES, rules);
}

export async function getPreferences(kv: KVStorage): Promise<Preferences> {
  return await kvGetJson<Preferences>(kv, KEY_PREFERENCES, { defaultBacktestYears: 10 });
}

export async function putPreferences(kv: KVStorage, prefs: Preferences): Promise<void> {
  await kvPutJson(kv, KEY_PREFERENCES, prefs);
}

/**
 * 安全的正则匹配：限制 pattern 长度和复杂度以防止 ReDoS
 */
function safeRegexTest(pattern: string, input: string): boolean {
  // 限制 pattern 长度
  if (pattern.length > 50) return false;
  
  // 禁止可能导致灾难性回溯的模式
  // - 嵌套量词如 (a+)+, (a*)*
  // - 重叠交替如 (a|a)+
  if (/([+*])\1|\([^)]*[+*][^)]*\)[+*]/.test(pattern)) return false;
  
  try {
    const re = new RegExp(pattern, 'i');
    return re.test(input);
  } catch {
    return false;
  }
}

export function applyRuleTags(symbol: string, rules: TagRule[]): string[] {
  const out: string[] = [];
  for (const r of rules) {
    try {
      if (r.rule.type === 'symbol_in') {
        const set = new Set((r.rule.symbols ?? []).map((s) => normalizeAndValidateSymbol(s)).filter(Boolean) as string[]);
        if (set.has(symbol)) out.push(r.name);
      } else if (r.rule.type === 'regex') {
        // 使用安全的正则匹配
        if (safeRegexTest(r.rule.pattern, symbol)) out.push(r.name);
      }
    } catch {
      // ignore invalid rules
    }
  }
  return out;
}

export function mergeTags(manual: string[], auto: string[]): string[] {
  const s = new Set<string>();
  for (const t of manual) if (t && typeof t === 'string') s.add(t);
  for (const t of auto) if (t && typeof t === 'string') s.add(t);
  return Array.from(s);
}


