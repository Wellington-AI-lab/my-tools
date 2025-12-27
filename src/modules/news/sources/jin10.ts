/**
 * 金十数据 - 财经快讯
 * 通过 JS feed 获取
 */

import type { NewsItem, NewsSourceAdapter } from '../types';
import { fetchWithTimeout, generateId, stripHtml } from '../utils';

type Jin10Item = {
  id: string;
  time: string;
  type: number;
  data: {
    title?: string;
    content?: string;
    pic?: string;
    important?: number;
  };
};

async function fetchJin10(opts?: { limit?: number; timeoutMs?: number }): Promise<NewsItem[]> {
  const ts = Date.now();
  const url = `https://www.jin10.com/flash_newest.js?t=${ts}`;

  const resp = await fetchWithTimeout(url, { timeoutMs: opts?.timeoutMs ?? 10000 });
  if (!resp.ok) throw new Error(`Jin10 HTTP ${resp.status}`);

  const text = await resp.text();
  // 解析 JS: "var newest = [...];"
  const jsonStr = text.replace(/^var\s+newest\s*=\s*/, '').replace(/;\s*$/, '');

  let items: Jin10Item[];
  try {
    items = JSON.parse(jsonStr) as Jin10Item[];
  } catch {
    throw new Error('Jin10 JSON parse failed');
  }

  const limit = opts?.limit ?? 30;

  return items
    .filter((item) => item.data?.content || item.data?.title)
    .slice(0, limit)
    .map((item) => {
      // 解析标题: "【美股】纳指涨1%" => 提取内容
      const content = item.data.content || '';
      const titleMatch = content.match(/【([^】]*)】(.*)/);
      const title = titleMatch
        ? `[${titleMatch[1]}] ${stripHtml(titleMatch[2])}`
        : stripHtml(content);

      // 解析时间: "20241227 10:30:00" => ISO
      const timeStr = item.time || '';
      const timeMatch = timeStr.match(/^(\d{4})(\d{2})(\d{2}) (\d{2}:\d{2}:\d{2})$/);
      const publishedAt = timeMatch
        ? `${timeMatch[1]}-${timeMatch[2]}-${timeMatch[3]}T${timeMatch[4]}+08:00`
        : undefined;

      return {
        id: generateId('jin10', item.id),
        source: 'jin10' as const,
        title: title.slice(0, 200),
        url: `https://www.jin10.com/flash/${item.id}.html`,
        publishedAt,
        extra: { important: item.data.important === 1 },
      };
    });
}

export const jin10Adapter: NewsSourceAdapter = {
  id: 'jin10',
  name: 'Jin10',
  nameZh: '金十数据',
  url: 'https://www.jin10.com',
  fetch: fetchJin10,
};
