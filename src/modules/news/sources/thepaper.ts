/**
 * 澎湃新闻 - 时政财经
 * API: https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar
 */

import type { NewsItem, NewsSourceAdapter } from '../types';
import { fetchWithTimeout, generateId, stripHtml, nowIso } from '../utils';

type ThePaperItem = {
  contId?: string;
  name?: string;
  pubTimeLong?: number;
};

type ThePaperResponse = {
  data?: {
    hotNews?: ThePaperItem[];
  };
};

async function fetchThePaper(opts?: { limit?: number; timeoutMs?: number }): Promise<NewsItem[]> {
  const url = 'https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar';

  try {
    const resp = await fetchWithTimeout(url, {
      timeoutMs: opts?.timeoutMs ?? 15000,
      headers: {
        Referer: 'https://www.thepaper.cn/',
        Origin: 'https://www.thepaper.cn',
      },
    });

    if (!resp.ok) {
      console.warn(`ThePaper HTTP ${resp.status}`);
      return [];
    }

    const json = (await resp.json()) as ThePaperResponse;
    const items = json?.data?.hotNews ?? [];
    const limit = opts?.limit ?? 30;

    return items
      .filter((item) => item.name && item.contId)
      .slice(0, limit)
      .map((item) => ({
        id: generateId('thepaper', item.contId!),
        source: 'thepaper' as const,
        title: stripHtml(item.name!),
        url: `https://www.thepaper.cn/newsDetail_forward_${item.contId}`,
        publishedAt: item.pubTimeLong ? new Date(item.pubTimeLong).toISOString() : nowIso(),
      }));
  } catch (e) {
    console.warn('ThePaper fetch failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

export const thepaperAdapter: NewsSourceAdapter = {
  id: 'thepaper',
  name: 'ThePaper',
  nameZh: '澎湃新闻',
  url: 'https://www.thepaper.cn',
  fetch: fetchThePaper,
};
