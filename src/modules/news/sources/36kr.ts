/**
 * 36氪 - 科技创投
 * API: https://36kr.com/api/newsflash
 */

import type { NewsItem, NewsSourceAdapter } from '../types';
import { fetchWithTimeout, generateId, stripHtml, nowIso } from '../utils';

type Kr36Item = {
  id: number;
  title?: string;
  description?: string;
  published_at?: string;
  news_url?: string;
  user?: { name?: string };
};

type Kr36Response = {
  data?: {
    items?: Kr36Item[];
  };
};

async function fetch36Kr(opts?: { limit?: number; timeoutMs?: number }): Promise<NewsItem[]> {
  const limit = opts?.limit ?? 30;
  const url = `https://36kr.com/api/newsflash?per_page=${limit}`;

  try {
    const resp = await fetchWithTimeout(url, {
      timeoutMs: opts?.timeoutMs ?? 15000, // 增加超时时间
      headers: {
        Referer: 'https://36kr.com/',
        Origin: 'https://36kr.com',
      },
    });

    if (!resp.ok) {
      console.warn(`36Kr HTTP ${resp.status}`);
      return [];
    }

    const json = (await resp.json()) as Kr36Response;
    const items = json?.data?.items ?? [];

    return items
      .filter((item) => item.title)
      .map((item) => ({
        id: generateId('36kr', String(item.id)),
        source: '36kr' as const,
        title: stripHtml(item.title!),
        summary: item.description ? stripHtml(item.description).slice(0, 300) : undefined,
        url: item.news_url || `https://36kr.com/newsflashes/${item.id}`,
        publishedAt: item.published_at || nowIso(),
        author: item.user?.name,
      }));
  } catch (e) {
    // 36Kr 可能响应慢或被限流，静默失败
    console.warn('36Kr fetch failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

export const kr36Adapter: NewsSourceAdapter = {
  id: '36kr',
  name: '36Kr',
  nameZh: '36氪',
  url: 'https://36kr.com',
  fetch: fetch36Kr,
};
