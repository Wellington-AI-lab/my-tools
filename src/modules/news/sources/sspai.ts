/**
 * 少数派 - 数码生活
 * API: https://sspai.com/api/v1/article/
 */

import type { NewsItem, NewsSourceAdapter } from '../types';
import { fetchWithTimeout, generateId, stripHtml, nowIso } from '../utils';

type SspaiItem = {
  id: number;
  title?: string;
  summary?: string;
  created_at?: number;
  author?: { nickname?: string };
};

type SspaiResponse = {
  data?: SspaiItem[];
};

async function fetchSspai(opts?: { limit?: number; timeoutMs?: number }): Promise<NewsItem[]> {
  const limit = opts?.limit ?? 30;
  const ts = Math.floor(Date.now() / 1000);
  const url = `https://sspai.com/api/v1/article/tag/page/get?limit=${limit}&offset=0&created_at=${ts}&tag=%E7%83%AD%E9%97%A8%E6%96%87%E7%AB%A0`;

  const resp = await fetchWithTimeout(url, {
    timeoutMs: opts?.timeoutMs ?? 10000,
    headers: { Referer: 'https://sspai.com/' },
  });
  if (!resp.ok) throw new Error(`Sspai HTTP ${resp.status}`);

  const json = (await resp.json()) as SspaiResponse;
  const items = json?.data ?? [];

  return items
    .filter((item) => item.title)
    .map((item) => ({
      id: generateId('sspai', String(item.id)),
      source: 'sspai' as const,
      title: stripHtml(item.title!),
      summary: item.summary ? stripHtml(item.summary).slice(0, 300) : undefined,
      url: `https://sspai.com/post/${item.id}`,
      publishedAt: item.created_at ? new Date(item.created_at * 1000).toISOString() : nowIso(),
      author: item.author?.nickname,
    }));
}

export const sspaiAdapter: NewsSourceAdapter = {
  id: 'sspai',
  name: 'Sspai',
  nameZh: '少数派',
  url: 'https://sspai.com',
  fetch: fetchSspai,
};
