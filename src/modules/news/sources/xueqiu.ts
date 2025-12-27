/**
 * 雪球 - 股票社区热门
 * 使用公开的热门话题 API（不需要登录）
 */

import type { NewsItem, NewsSourceAdapter } from '../types';
import { fetchWithTimeout, generateId, stripHtml, nowIso } from '../utils';

type XueqiuItem = {
  id: number;
  title?: string;
  text?: string;
  description?: string;
  created_at?: number;
  target?: string;
  user?: { screen_name?: string };
};

type XueqiuResponse = {
  list?: XueqiuItem[];
};

async function fetchXueqiu(opts?: { limit?: number; timeoutMs?: number }): Promise<NewsItem[]> {
  // 使用热门话题列表 API（更稳定，不需要登录）
  const url = 'https://xueqiu.com/query/v1/symbol/search/status.json?count=20&comment=0&symbol=&hl=0&source=all&sort=time&q=&type=11';

  try {
    const resp = await fetchWithTimeout(url, {
      timeoutMs: opts?.timeoutMs ?? 10000,
      headers: {
        Referer: 'https://xueqiu.com/',
        Origin: 'https://xueqiu.com',
      },
    });

    if (!resp.ok) {
      // 雪球 API 可能需要 cookie，如果失败则返回空
      console.warn(`Xueqiu HTTP ${resp.status}`);
      return [];
    }

    const json = (await resp.json()) as XueqiuResponse;
    const items = json?.list ?? [];
    const limit = opts?.limit ?? 30;

    return items
      .filter((item) => item.title || item.text)
      .slice(0, limit)
      .map((item) => ({
        id: generateId('xueqiu', String(item.id)),
        source: 'xueqiu' as const,
        title: stripHtml(item.title || item.text || '').slice(0, 200),
        summary: item.description ? stripHtml(item.description).slice(0, 300) : undefined,
        url: item.target || `https://xueqiu.com/${item.id}`,
        publishedAt: item.created_at ? new Date(item.created_at).toISOString() : nowIso(),
        author: item.user?.screen_name,
      }));
  } catch (e) {
    // 雪球可能有反爬虫机制，静默失败
    console.warn('Xueqiu fetch failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

export const xueqiuAdapter: NewsSourceAdapter = {
  id: 'xueqiu',
  name: 'Xueqiu',
  nameZh: '雪球',
  url: 'https://xueqiu.com',
  fetch: fetchXueqiu,
};
