import type { RednoteFeedCard, RednoteRawItem } from '@/modules/in-depth-analysis/types';

export const DEFAULT_BLACKLIST = ['私聊', '领资料', '兼职', '加V', '回复111'] as const;

export type Stage1Config = {
  heatThreshold: number;
  dedupTitleSimilarityThreshold: number;
  blacklistKeywords: string[];
  maxItemsAfterFilter: number;
};

export type Stage1Result = {
  cards: RednoteFeedCard[];
  scanned: number;
  keptAfterHardFilter: number;
  keptAfterDedup: number;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeText(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    // remove most punctuation/symbols (keep CJK, letters, numbers)
    .replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, '');
}

function bigrams(s: string): Set<string> {
  const t = normalizeText(s);
  const grams = new Set<string>();
  if (!t) return grams;
  if (t.length === 1) {
    grams.add(t);
    return grams;
  }
  for (let i = 0; i < t.length - 1; i++) {
    grams.add(t.slice(i, i + 2));
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let inter = 0;
  // iterate smaller set
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

function containsBlacklist(text: string, blacklist: string[]): boolean {
  const t = String(text || '');
  return blacklist.some((kw) => kw && t.includes(kw));
}

/**
 * Parse messy social metrics:
 * - "1.2万" / "2.1w" -> 12000 / 21000
 * - "1,240" -> 1240
 * - "赞 980" -> 980
 */
export function parseMetric(input: unknown): number {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.max(0, Math.floor(input)) : 0;
  if (input == null) return 0;
  const s = String(input).trim();
  if (!s) return 0;

  // normalize commas, prefixes
  const cleaned = s.replace(/,/g, '').replace(/[^\d.\u4e00-\u9fa5wW万千]/g, ' ');

  // Chinese units / shorthand
  const mWan = cleaned.match(/(\d+(?:\.\d+)?)\s*万/);
  if (mWan) return Math.max(0, Math.floor(Number(mWan[1]) * 10000));
  const mQian = cleaned.match(/(\d+(?:\.\d+)?)\s*千/);
  if (mQian) return Math.max(0, Math.floor(Number(mQian[1]) * 1000));
  const mW = cleaned.match(/(\d+(?:\.\d+)?)\s*[wW]/);
  if (mW) return Math.max(0, Math.floor(Number(mW[1]) * 10000));

  const mNum = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!mNum) return 0;
  return Math.max(0, Math.floor(Number(mNum[1])));
}

export function heatScore(metrics: {
  likes: number;
  collects: number;
  comments: number;
  shares: number;
}): number {
  return (
    metrics.likes * 1 +
    metrics.collects * 3 +
    metrics.comments * 5 +
    metrics.shares * 5
  );
}

function stableIdForItem(it: RednoteRawItem): string {
  const primary = it.noteId ?? it.id ?? null;
  if (primary != null && String(primary).trim()) return String(primary);

  // fallback: lightweight stable hash (non-crypto)
  const title = String(it.title ?? '');
  const author = String(it.author ?? it.authorId ?? '');
  const created = String(it.createdAt ?? '');
  const base = `${title}|${author}|${created}`.slice(0, 256);
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `mock_${(h >>> 0).toString(16)}`;
}

function extractTags(tags: unknown): string[] | undefined {
  if (Array.isArray(tags)) {
    const out = tags
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter(Boolean)
      .slice(0, 12);
    return out.length ? out : undefined;
  }
  return undefined;
}

export function stage1Filter(rawItems: RednoteRawItem[], cfg: Stage1Config): Stage1Result {
  const scanned = Array.isArray(rawItems) ? rawItems.length : 0;
  const heatThreshold = Number.isFinite(cfg.heatThreshold) ? cfg.heatThreshold : 50;
  const dedupThreshold = Number.isFinite(cfg.dedupTitleSimilarityThreshold)
    ? cfg.dedupTitleSimilarityThreshold
    : 0.66;
  const blacklist = Array.isArray(cfg.blacklistKeywords) ? cfg.blacklistKeywords : Array.from(DEFAULT_BLACKLIST);
  const maxAfter = clampInt(cfg.maxItemsAfterFilter, 1, 200);

  const mapped: RednoteFeedCard[] = (Array.isArray(rawItems) ? rawItems : []).map((it) => {
    const likes = parseMetric(it.likes);
    const collects = parseMetric(it.collects);
    const comments = parseMetric(it.comments);
    const shares = parseMetric(it.shares);
    const hs = heatScore({ likes, collects, comments, shares });

    const title = String(it.title ?? '').trim();
    const content = String(it.desc ?? it.content ?? '').trim();
    const safeTitle = title || (content ? content.slice(0, 40) : '（无标题）');
    const safeContent = content || '';

    return {
      id: stableIdForItem(it),
      url: typeof it.url === 'string' ? it.url : undefined,
      title: safeTitle,
      content: safeContent,
      author: typeof it.author === 'string' ? it.author : undefined,
      createdAt: typeof it.createdAt === 'string' ? it.createdAt : undefined,
      metrics: { likes, collects, comments, shares, heatScore: hs },
      tags: extractTags(it.tags),
    };
  });

  // Hard filter: threshold + blacklist
  const hardFiltered = mapped.filter((c) => {
    if (c.metrics.heatScore < heatThreshold) return false;
    const blob = `${c.title}\n${c.content}`;
    if (containsBlacklist(blob, blacklist)) return false;
    return true;
  });

  // Sort by HeatScore desc (higher signal first)
  hardFiltered.sort((a, b) => b.metrics.heatScore - a.metrics.heatScore);

  // Dedup based on title similarity (2-gram Jaccard), keep highest-score version.
  const kept: RednoteFeedCard[] = [];
  const keptTitleGrams: Array<Set<string>> = [];
  for (const c of hardFiltered) {
    const g = bigrams(c.title);
    let dup = false;
    for (let i = 0; i < kept.length; i++) {
      const sim = jaccard(g, keptTitleGrams[i]);
      if (sim >= dedupThreshold) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      kept.push(c);
      keptTitleGrams.push(g);
    }
    if (kept.length >= maxAfter) break;
  }

  return {
    cards: kept,
    scanned,
    keptAfterHardFilter: hardFiltered.length,
    keptAfterDedup: kept.length,
  };
}


