import type { TrendTheme, TrendsReport } from '@/modules/trends/types';
import type { AliasMatcher } from '@/modules/trends/normalize';
import { createAliasMatcher } from '@/modules/trends/normalize';
import { clusterThemeCards, type TrendEventCluster } from '@/modules/trends/cluster';
import { normalizeText } from '@/modules/trends/utils';

export type TrendSpike = {
  theme: TrendTheme;
  keyword: string; // display
  canonical: string;
  today_count: number;
  prev_avg: number;
  ratio: number; // today / max(prev_avg, 0.5)
};

export type TrendResonance = {
  theme: TrendTheme;
  keyword: string; // display
  canonical: string;
  sources: string[]; // e.g. ["google_trends_rss","weibo_hot"]
};

export type TrendsCompareResult = {
  meta: {
    day_key: string;
    window_days: number; // includes today
  };
  spikes: TrendSpike[];
  resonance: TrendResonance[];
  clusters: TrendEventCluster[];
  per_theme: Array<{
    theme: TrendTheme;
    today_keywords: string[];
    spiking_keywords: string[];
  }>;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normKeyword(matcher: AliasMatcher, k: string): string {
  return matcher.canonicalizeKeyword(String(k || ''));
}

function collectThemeKeywordCounts(matcher: AliasMatcher, report: TrendsReport): Map<TrendTheme, Map<string, number>> {
  const map = new Map<TrendTheme, Map<string, number>>();
  for (const g of report.trends_by_theme || []) {
    const theme = g.theme;
    if (!map.has(theme)) map.set(theme, new Map());
    const freq = map.get(theme)!;
    for (const k of g.keywords || []) {
      const nk = normKeyword(matcher, k);
      if (!nk) continue;
      freq.set(nk, (freq.get(nk) ?? 0) + 1);
    }
  }
  return map;
}

function collectThemeKeywordSourcesAndDisplays(matcher: AliasMatcher, report: TrendsReport): {
  byThemeCanonicalToSources: Map<TrendTheme, Map<string, Set<string>>>;
  byThemeCanonicalToDisplays: Map<TrendTheme, Map<string, Set<string>>>;
} {
  const byThemeCanonicalToSources = new Map<TrendTheme, Map<string, Set<string>>>();
  const byThemeCanonicalToDisplays = new Map<TrendTheme, Map<string, Set<string>>>();

  for (const g of report.trends_by_theme || []) {
    const theme = g.theme;
    if (!byThemeCanonicalToSources.has(theme)) byThemeCanonicalToSources.set(theme, new Map());
    if (!byThemeCanonicalToDisplays.has(theme)) byThemeCanonicalToDisplays.set(theme, new Map());
    const kwToSources = byThemeCanonicalToSources.get(theme)!;
    const kwToDisplays = byThemeCanonicalToDisplays.get(theme)!;

    const keywordList = (g.keywords || []).map((k) => String(k || '').trim()).filter(Boolean);
    const canonicalKeywords = Array.from(new Set(keywordList.map((k) => normKeyword(matcher, k)).filter(Boolean)));

    // For each canonical keyword, try to find which cards "support" it by substring matching on variants.
    for (const ck of canonicalKeywords) {
      const variants = matcher.variantsForKeyword(ck);
      const supportedSources = kwToSources.get(ck) ?? new Set<string>();
      const displaySet = kwToDisplays.get(ck) ?? new Set<string>();
      for (const rawKw of keywordList) {
        if (normKeyword(matcher, rawKw) === ck) displaySet.add(rawKw);
      }

      for (const c of g.cards || []) {
        const title = String(c.title || '');
        const nTitle = normalizeText(title);
        const hit = variants.some((v) => {
          if (!v) return false;
          return nTitle.includes(v);
        });
        if (hit) supportedSources.add(String(c.source || ''));
      }

      kwToSources.set(ck, supportedSources);
      kwToDisplays.set(ck, displaySet);
    }
  }

  return { byThemeCanonicalToSources, byThemeCanonicalToDisplays };
}

export function compareTrendsWindow(reports: TrendsReport[], windowDays = 7): TrendsCompareResult | null {
  const matcher = createAliasMatcher();
  return compareTrendsWindowWithMatcher(reports, windowDays, matcher);
}

export function compareTrendsWindowWithMatcher(
  reports: TrendsReport[],
  windowDays: number,
  matcher: AliasMatcher
): TrendsCompareResult | null {
  if (!Array.isArray(reports) || reports.length === 0) return null;
  const window = reports.slice(0, clamp(windowDays, 2, 14)); // reports are newest-first
  const today = window[0];
  if (!today) return null;

  const themeCountsToday = collectThemeKeywordCounts(matcher, today);
  const { byThemeCanonicalToSources, byThemeCanonicalToDisplays } = collectThemeKeywordSourcesAndDisplays(matcher, today);

  // Aggregate previous days counts per theme/keyword
  const prevAgg = new Map<TrendTheme, Map<string, number>>();
  const prevDays = window.slice(1);
  for (const r of prevDays) {
    const counts = collectThemeKeywordCounts(matcher, r);
    for (const [theme, freq] of counts.entries()) {
      const agg = prevAgg.get(theme) ?? new Map<string, number>();
      for (const [k, n] of freq.entries()) agg.set(k, (agg.get(k) ?? 0) + n);
      prevAgg.set(theme, agg);
    }
  }

  const spikes: TrendSpike[] = [];
  const perTheme: TrendsCompareResult['per_theme'] = [];

  for (const [theme, todayFreq] of themeCountsToday.entries()) {
    const prevFreq = prevAgg.get(theme) ?? new Map<string, number>();
    const todayKeywords = Array.from(todayFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => {
        const displays = Array.from(byThemeCanonicalToDisplays.get(theme)?.get(k) ?? []);
        return matcher.pickDisplayKeyword({ canonical: k, candidates: displays.length ? displays : [k] });
      })
      .slice(0, 6);

    const spiking: Array<{ k: string; ratio: number }> = [];
    for (const [k, todayCount] of todayFreq.entries()) {
      const prevTotal = prevFreq.get(k) ?? 0;
      const prevAvg = prevDays.length ? prevTotal / prevDays.length : 0;
      const denom = Math.max(0.5, prevAvg);
      const ratio = todayCount / denom;
      if (todayCount >= 1 && ratio >= 2.2) {
        const displays = Array.from(byThemeCanonicalToDisplays.get(theme)?.get(k) ?? []);
        const display = matcher.pickDisplayKeyword({ canonical: k, candidates: displays.length ? displays : [k] });
        spikes.push({
          theme,
          keyword: display,
          canonical: k,
          today_count: todayCount,
          prev_avg: Number(prevAvg.toFixed(2)),
          ratio: Number(ratio.toFixed(2)),
        });
        spiking.push({ k, ratio });
      }
    }

    spiking.sort((a, b) => b.ratio - a.ratio);
    perTheme.push({
      theme,
      today_keywords: todayKeywords,
      spiking_keywords: spiking.slice(0, 3).map((x) => {
        const displays = Array.from(byThemeCanonicalToDisplays.get(theme)?.get(x.k) ?? []);
        return matcher.pickDisplayKeyword({ canonical: x.k, candidates: displays.length ? displays : [x.k] });
      }),
    });
  }

  spikes.sort((a, b) => b.ratio - a.ratio);

  // Cross-platform resonance: keywords that appear and have >=2 distinct sources among today's cards in a theme
  const resonance: TrendResonance[] = [];
  for (const [theme, kwToSources] of byThemeCanonicalToSources.entries()) {
    for (const [k, srcSet] of kwToSources.entries()) {
      const sources = Array.from(srcSet).filter(Boolean);
      const uniq = Array.from(new Set(sources));
      if (uniq.length >= 2) {
        const displays = Array.from(byThemeCanonicalToDisplays.get(theme)?.get(k) ?? []);
        const display = matcher.pickDisplayKeyword({ canonical: k, candidates: displays.length ? displays : [k] });
        resonance.push({ theme, keyword: display, canonical: k, sources: uniq.sort() });
      }
    }
  }
  resonance.sort((a, b) => b.sources.length - a.sources.length || a.keyword.localeCompare(b.keyword));

  // Event clusters (today only): group cards by title similarity within theme.
  const clusters: TrendEventCluster[] = [];
  for (const g of today.trends_by_theme || []) {
    if (!g.cards || g.cards.length < 2) continue;
    clusters.push(...clusterThemeCards({ theme: g.theme, cards: g.cards, similarityThreshold: 0.72, maxClusters: 6 }));
  }
  clusters.sort((a, b) => b.size - a.size || b.sources.length - a.sources.length);

  return {
    meta: { day_key: today.meta.day_key, window_days: window.length },
    spikes: spikes.slice(0, 20),
    resonance: resonance.slice(0, 20),
    clusters: clusters.slice(0, 18),
    per_theme: perTheme,
  };
}


