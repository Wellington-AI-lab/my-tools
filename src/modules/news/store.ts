/**
 * 信息流 KV 存储
 */

import type { NewsReport, NewsTheme } from './types';
import { dayKeyShanghai } from './utils';

const KEY_LATEST = 'news:report:latest';
const KEY_PREFIX_DAY = 'news:report:day:';
const KEY_KEYWORDS = 'news:keywords:latest';

/**
 * 保存最新报告
 */
export async function putNewsReport(kv: KVNamespace, report: NewsReport): Promise<void> {
  const dayKey = report.meta.day_key;

  await Promise.all([
    // 最新报告
    kv.put(KEY_LATEST, JSON.stringify(report), { expirationTtl: 60 * 60 * 24 * 7 }),
    // 按日期存储
    kv.put(`${KEY_PREFIX_DAY}${dayKey}`, JSON.stringify(report), { expirationTtl: 60 * 60 * 24 * 30 }),
  ]);
}

/**
 * 获取最新报告
 */
export async function getLatestNewsReport(kv: KVNamespace): Promise<NewsReport | null> {
  const raw = await kv.get(KEY_LATEST);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as NewsReport;
  } catch {
    return null;
  }
}

/**
 * 获取指定日期的报告
 */
export async function getNewsReportByDay(kv: KVNamespace, dayKey: string): Promise<NewsReport | null> {
  const raw = await kv.get(`${KEY_PREFIX_DAY}${dayKey}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as NewsReport;
  } catch {
    return null;
  }
}

/**
 * 保存关键词（从 Trend Radar 同步过来）
 */
export async function putKeywords(
  kv: KVNamespace,
  keywordsByTheme: Record<NewsTheme, string[]>
): Promise<void> {
  await kv.put(KEY_KEYWORDS, JSON.stringify({
    keywords: keywordsByTheme,
    updatedAt: new Date().toISOString(),
  }), { expirationTtl: 60 * 60 * 24 * 7 });
}

/**
 * 获取最新关键词
 */
export async function getKeywords(
  kv: KVNamespace
): Promise<{ keywords: Record<NewsTheme, string[]>; updatedAt: string } | null> {
  const raw = await kv.get(KEY_KEYWORDS);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
