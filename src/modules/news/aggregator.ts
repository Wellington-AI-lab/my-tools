/**
 * 新闻聚合器 - 并行抓取所有数据源
 */

import type { NewsItem, NewsSourceId, SourceFetchResult } from './types';
import { ALL_ADAPTERS } from './sources';
import { nowIso, dedupeNews } from './utils';

export type AggregatorResult = {
  items: NewsItem[];
  bySource: Record<NewsSourceId, SourceFetchResult>;
  totalFetched: number;
  fetchedAt: string;
};

/**
 * 并行抓取所有数据源
 */
export async function aggregateAllSources(opts?: {
  limitPerSource?: number;
  timeoutMs?: number;
}): Promise<AggregatorResult> {
  const limitPerSource = opts?.limitPerSource ?? 25;
  const timeoutMs = opts?.timeoutMs ?? 12000;

  const results = await Promise.allSettled(
    ALL_ADAPTERS.map(async (adapter) => {
      try {
        const items = await adapter.fetch({ limit: limitPerSource, timeoutMs });
        return {
          source: adapter.id,
          items,
          fetchedAt: nowIso(),
        } as SourceFetchResult;
      } catch (e) {
        return {
          source: adapter.id,
          items: [],
          fetchedAt: nowIso(),
          error: e instanceof Error ? e.message : String(e),
        } as SourceFetchResult;
      }
    })
  );

  const bySource: Record<string, SourceFetchResult> = {};
  const allItems: NewsItem[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      bySource[result.value.source] = result.value;
      allItems.push(...result.value.items);
    }
  }

  // 去重（按 URL）
  const dedupedItems = dedupeNews(allItems);

  return {
    items: dedupedItems,
    bySource: bySource as Record<NewsSourceId, SourceFetchResult>,
    totalFetched: dedupedItems.length,
    fetchedAt: nowIso(),
  };
}
