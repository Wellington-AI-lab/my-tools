/**
 * 华尔街见闻 - 财经快讯和文章
 * API: https://api-one.wallstcn.com/apiv1/content/
 */

import type { NewsItem, NewsSourceAdapter } from '../types';
import { fetchWithTimeout, generateId, nowIso, stripHtml } from '../utils';

type WallStreetItem = {
  id: number;
  title?: string;
  content_text?: string;
  display_time?: number;
  uri?: string;
};

type WallStreetResponse = {
  data?: {
    items?: WallStreetItem[];
  };
};

async function fetchWallStreetCN(opts?: { limit?: number; timeoutMs?: number }): Promise<NewsItem[]> {
  const limit = opts?.limit ?? 30;
  const url = `https://api-one.wallstcn.com/apiv1/content/information-flow?channel=global-channel&accept=article&limit=${limit}`;

  const resp = await fetchWithTimeout(url, { timeoutMs: opts?.timeoutMs ?? 10000 });
  if (!resp.ok) throw new Error(`WallStreetCN HTTP ${resp.status}`);

  const json = (await resp.json()) as WallStreetResponse;
  const items = json?.data?.items ?? [];

  return items
    .filter((item) => item.title && item.id)
    .map((item) => ({
      id: generateId('wallstreetcn', String(item.id)),
      source: 'wallstreetcn' as const,
      title: stripHtml(item.title || item.content_text || ''),
      summary: item.content_text ? stripHtml(item.content_text).slice(0, 200) : undefined,
      url: item.uri || `https://wallstreetcn.com/articles/${item.id}`,
      publishedAt: item.display_time ? new Date(item.display_time * 1000).toISOString() : nowIso(),
    }));
}

export const wallstreetcnAdapter: NewsSourceAdapter = {
  id: 'wallstreetcn',
  name: 'WallStreetCN',
  nameZh: '华尔街见闻',
  url: 'https://wallstreetcn.com',
  fetch: fetchWallStreetCN,
};
