/**
 * 信息流模块工具函数
 */

import type { NewsItem, NewsSourceId } from './types';

// 生成唯一 ID
export function generateId(source: NewsSourceId, identifier: string): string {
  return `${source}:${identifier}`;
}

// 获取当前 ISO 时间
export function nowIso(): string {
  return new Date().toISOString();
}

// 获取上海时区的日期 key
export function dayKeyShanghai(d = new Date()): string {
  const sh = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return sh.toISOString().slice(0, 10);
}

// HTML 实体解码
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// 清理 HTML 标签
export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

// 截断文本
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

// 带超时的 fetch
export async function fetchWithTimeout(
  url: string,
  opts?: {
    timeoutMs?: number;
    headers?: Record<string, string>;
    method?: string;
    body?: string;
  }
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 10000);

  try {
    return await fetch(url, {
      method: opts?.method ?? 'GET',
      headers: {
        'User-Agent': 'my-tools/1.0 (news-aggregator)',
        Accept: 'application/json, text/html, application/xml, */*',
        ...opts?.headers,
      },
      body: opts?.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// 解析 JSON 安全
export async function safeJsonParse<T>(resp: Response): Promise<T | null> {
  try {
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

// 去重新闻（按 URL）
export function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 主题中文名
export const THEME_NAMES: Record<string, string> = {
  finance: '金融',
  economy: '经济',
  ai: 'AI 科技',
};
