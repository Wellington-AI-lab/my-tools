/**
 * Hacker News - 科技社区
 * API: https://hacker-news.firebaseio.com/v0/
 */

import type { NewsItem, NewsSourceAdapter } from '../types';
import { fetchWithTimeout, generateId } from '../utils';

type HNItem = {
  id: number;
  title?: string;
  url?: string;
  by?: string;
  time?: number;
  score?: number;
  type?: string;
};

async function fetchHackerNews(opts?: { limit?: number; timeoutMs?: number }): Promise<NewsItem[]> {
  const limit = opts?.limit ?? 30;
  const timeout = opts?.timeoutMs ?? 10000;

  // 获取热门故事 ID 列表
  const topStoriesResp = await fetchWithTimeout(
    'https://hacker-news.firebaseio.com/v0/topstories.json',
    { timeoutMs: timeout }
  );
  if (!topStoriesResp.ok) throw new Error(`HN topstories HTTP ${topStoriesResp.status}`);

  const storyIds = (await topStoriesResp.json()) as number[];
  const topIds = storyIds.slice(0, limit);

  // 并行获取每个故事的详情
  const storyPromises = topIds.map(async (id) => {
    try {
      const resp = await fetchWithTimeout(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        { timeoutMs: 5000 }
      );
      if (!resp.ok) return null;
      return (await resp.json()) as HNItem;
    } catch {
      return null;
    }
  });

  const stories = await Promise.all(storyPromises);

  return stories
    .filter((item): item is HNItem => item !== null && !!item.title && item.type === 'story')
    .map((item) => ({
      id: generateId('hackernews', String(item.id)),
      source: 'hackernews' as const,
      title: item.title!,
      url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      publishedAt: item.time ? new Date(item.time * 1000).toISOString() : undefined,
      author: item.by,
      extra: { score: item.score },
    }));
}

export const hackernewsAdapter: NewsSourceAdapter = {
  id: 'hackernews',
  name: 'Hacker News',
  nameZh: 'Hacker News',
  url: 'https://news.ycombinator.com',
  fetch: fetchHackerNews,
};
