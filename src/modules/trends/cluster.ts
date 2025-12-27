import type { TrendCard, TrendTheme } from '@/modules/trends/types';
import { bigrams, jaccard } from '@/modules/trends/utils';

export type TrendEventCluster = {
  theme: TrendTheme;
  label: string; // representative title
  size: number;
  sources: string[];
  top_items: Array<{ title: string; url?: string; source: string; score: number }>;
  impact?: {
    direction: 'bullish' | 'bearish' | 'neutral' | 'unknown';
    confidence: number; // 0..1
    rationale: string;
  };
};

export function clusterThemeCards(opts: {
  theme: TrendTheme;
  cards: TrendCard[];
  similarityThreshold?: number; // title similarity
  maxClusters?: number;
}): TrendEventCluster[] {
  const cards = Array.isArray(opts.cards) ? opts.cards : [];
  const th = Number.isFinite(opts.similarityThreshold) ? Number(opts.similarityThreshold) : 0.72;
  const maxClusters = Math.max(3, Math.min(30, Math.floor(opts.maxClusters ?? 12)));

  // Sort by score desc to pick better representatives.
  const sorted = cards.slice().sort((a, b) => (b.signals?.score ?? 0) - (a.signals?.score ?? 0));
  const reps: Array<{ rep: TrendCard; repGrams: Set<string>; members: TrendCard[] }> = [];

  for (const c of sorted) {
    const g = bigrams(c.title);
    let bestIdx = -1;
    let bestSim = 0;
    for (let i = 0; i < reps.length; i++) {
      const sim = jaccard(g, reps[i].repGrams);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestSim >= th) {
      reps[bestIdx].members.push(c);
    } else {
      reps.push({ rep: c, repGrams: g, members: [c] });
    }
    if (reps.length >= maxClusters && reps.every((x) => x.members.length >= 2)) {
      // once we have enough clusters and some density, stop early
      // (MVP heuristic)
    }
  }

  const clusters: TrendEventCluster[] = reps
    .map((x) => {
      const members = x.members.slice().sort((a, b) => (b.signals?.score ?? 0) - (a.signals?.score ?? 0));
      const sources = Array.from(new Set(members.map((m) => String(m.source || '')).filter(Boolean))).sort();
      return {
        theme: opts.theme,
        label: x.rep.title,
        size: members.length,
        sources,
        top_items: members.slice(0, 5).map((m) => ({
          title: m.title,
          url: m.url,
          source: m.source,
          score: m.signals?.score ?? 0,
        })),
      };
    })
    .sort((a, b) => b.size - a.size || b.sources.length - a.sources.length);

  return clusters.slice(0, maxClusters);
}


