/**
 * FT 中文网 - 国际财经
 * 使用 RSS feed
 */

import type { NewsItem, NewsSourceAdapter } from '../types';
import { fetchWithTimeout, generateId, stripHtml, decodeHtmlEntities } from '../utils';

async function fetchFTChinese(opts?: { limit?: number; timeoutMs?: number }): Promise<NewsItem[]> {
  const url = 'https://www.ftchinese.com/rss/news';

  const resp = await fetchWithTimeout(url, {
    timeoutMs: opts?.timeoutMs ?? 10000,
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!resp.ok) throw new Error(`FTChinese HTTP ${resp.status}`);

  const xml = await resp.text();
  const limit = opts?.limit ?? 30;

  // 简单 XML 解析（无需依赖）
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const itemXml = match[1];

    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const guidMatch = itemXml.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);

    const title = titleMatch ? decodeHtmlEntities(stripHtml(titleMatch[1])).trim() : '';
    const link = linkMatch ? linkMatch[1].trim() : '';
    const description = descMatch ? decodeHtmlEntities(stripHtml(descMatch[1])).trim() : '';
    const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
    const guid = guidMatch ? guidMatch[1].trim() : link;

    if (!title || !link) continue;

    items.push({
      id: generateId('ftchinese', guid || link),
      source: 'ftchinese',
      title,
      summary: description.slice(0, 300) || undefined,
      url: link,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : undefined,
    });
  }

  return items;
}

export const ftchineseAdapter: NewsSourceAdapter = {
  id: 'ftchinese',
  name: 'FTChinese',
  nameZh: 'FT 中文网',
  url: 'https://www.ftchinese.com',
  fetch: fetchFTChinese,
};
