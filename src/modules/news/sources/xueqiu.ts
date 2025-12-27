/**
 * 雪球 - 股票社区热门
 * API: https://xueqiu.com/statuses/hot/listV2.json
 */

import type { NewsItem, NewsSourceAdapter } from '../types';
import { fetchWithTimeout, generateId, stripHtml } from '../utils';

type XueqiuItem = {
  id: number;
  target: string;
  title?: string;
  text?: string;
  description?: string;
  created_at?: number;
  user?: { screen_name?: string };
};

type XueqiuResponse = {
  items?: XueqiuItem[];
};

async function fetchXueqiu(opts?: { limit?: number; timeoutMs?: number }): Promise<NewsItem[]> {
  const limit = opts?.limit ?? 30;
  const url = `https://xueqiu.com/statuses/hot/listV2.json?since_id=-1&max_id=-1&size=${limit}`;

  const resp = await fetchWithTimeout(url, {
    timeoutMs: opts?.timeoutMs ?? 10000,
    headers: {
      Cookie: 'xq_a_token=test', // 需要 cookie 才能访问
      Referer: 'https://xueqiu.com/',
    },
  });
  if (!resp.ok) throw new Error(`Xueqiu HTTP ${resp.status}`);

  const json = (await resp.json()) as XueqiuResponse;
  const items = json?.items ?? [];

  return items
    .filter((item) => item.title || item.text)
    .map((item) => ({
      id: generateId('xueqiu', String(item.id)),
      source: 'xueqiu' as const,
      title: stripHtml(item.title || item.text || '').slice(0, 200),
      summary: item.description ? stripHtml(item.description).slice(0, 300) : undefined,
      url: item.target || `https://xueqiu.com/${item.id}`,
      publishedAt: item.created_at ? new Date(item.created_at).toISOString() : undefined,
      author: item.user?.screen_name,
    }));
}

export const xueqiuAdapter: NewsSourceAdapter = {
  id: 'xueqiu',
  name: 'Xueqiu',
  nameZh: '雪球',
  url: 'https://xueqiu.com',
  fetch: fetchXueqiu,
};
