import type { TrendCard, TrendRawItem, TrendTheme } from '@/modules/trends/types';
import { ALL_THEMES } from '@/modules/trends/themes';
import { bigrams, jaccard, mapRawToCard } from '@/modules/trends/utils';

export type TrendsFilterConfig = {
  minScore: number;
  dedupTitleSimilarity: number; // 0..1
  maxPerTheme: number;
  maxTotal: number;
};

export type TrendsFilterResult = {
  cards: TrendCard[];
  byTheme: Map<TrendTheme, TrendCard[]>;
  scanned: number;
  keptAfterScore: number;
  keptAfterDedup: number;
};

export function filterAndGroupTrends(raw: TrendRawItem[], cfg: TrendsFilterConfig): TrendsFilterResult {
  const scanned = Array.isArray(raw) ? raw.length : 0;
  const minScore = Number.isFinite(cfg.minScore) ? cfg.minScore : 50;
  const dedup = Number.isFinite(cfg.dedupTitleSimilarity) ? cfg.dedupTitleSimilarity : 0.66;
  const maxPerTheme = Math.max(3, Math.min(30, Math.floor(cfg.maxPerTheme || 12)));
  const maxTotal = Math.max(20, Math.min(200, Math.floor(cfg.maxTotal || 120)));

  const mapped = (raw || []).map(mapRawToCard);

  const scoreFiltered = mapped.filter((c) => (c.signals?.score ?? 0) >= minScore && c.title);
  scoreFiltered.sort((a, b) => (b.signals?.score ?? 0) - (a.signals?.score ?? 0));

  // Dedup by title similarity (CN 2-gram works okay for mixed zh/en too).
  const kept: TrendCard[] = [];
  const keptGrams: Array<Set<string>> = [];
  for (const c of scoreFiltered) {
    const g = bigrams(c.title);
    let isDup = false;
    for (let i = 0; i < kept.length; i++) {
      const sim = jaccard(g, keptGrams[i]);
      if (sim >= dedup) {
        isDup = true;
        break;
      }
    }
    if (!isDup) {
      kept.push(c);
      keptGrams.push(g);
    }
    if (kept.length >= maxTotal) break;
  }

  const byTheme = new Map<TrendTheme, TrendCard[]>();
  for (const t of ALL_THEMES) byTheme.set(t, []);

  // assign to themes; if none matched, drop (MVP: we only care about configured themes)
  for (const c of kept) {
    if (!c.themes || c.themes.length === 0) continue;
    for (const t of c.themes) {
      const arr = byTheme.get(t);
      if (!arr) continue;
      if (arr.length < maxPerTheme) arr.push(c);
    }
  }

  // stable sorting within themes
  for (const [t, arr] of byTheme.entries()) {
    arr.sort((a, b) => (b.signals?.score ?? 0) - (a.signals?.score ?? 0));
    byTheme.set(t, arr.slice(0, maxPerTheme));
  }

  return {
    cards: kept,
    byTheme,
    scanned,
    keptAfterScore: scoreFiltered.length,
    keptAfterDedup: kept.length,
  };
}


