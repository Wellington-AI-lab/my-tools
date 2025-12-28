/**
 * News History Database Operations
 */

import { CONFIG } from '../core/constants';
import type { NewsItemWithTags } from '../core/tags';

/**
 * Save news items to history
 */
export async function saveNewsHistory(
  d1: D1Database,
  scanTime: string,
  newsWithTags: NewsItemWithTags[]
): Promise<{ success: boolean; saved: number; error?: string }> {
  try {
    const batchSize = CONFIG.NEWS_HISTORY_BATCH_SIZE;
    let totalSaved = 0;

    for (let i = 0; i < newsWithTags.length; i += batchSize) {
      const batch = newsWithTags.slice(i, i + batchSize);
      const stmt = d1.prepare(
        'INSERT OR REPLACE INTO news_history (id, url, title, tags, scan_time) VALUES (?, ?, ?, ?, ?)'
      );

      const statements = batch.map(item =>
        stmt.bind(
          item.id,
          item.url,
          item.title,
          JSON.stringify(item.tags),
          scanTime
        )
      );

      await d1.batch(statements);
      totalSaved += batch.length;
    }

    return { success: true, saved: totalSaved };
  } catch (error: any) {
    console.error('[trends/db/news] Failed to save:', error);
    return { success: false, saved: 0, error: error.message };
  }
}

/**
 * Query news by tag
 */
export async function queryNewsByTag(
  d1: D1Database,
  tag: string,
  limit: number = 10
): Promise<{ items: Array<{
  id: string;
  url: string;
  title: string;
  tags: string[];
  scan_time: string;
}>; count: number }> {
  // Validate input
  const sanitizedTag = tag.trim().slice(0, CONFIG.MAX_TAG_LENGTH);
  if (!sanitizedTag) {
    return { items: [], count: 0 };
  }

  try {
    const tagPattern = `"${sanitizedTag.replace(/"/g, '')}"`;
    const query = `
      SELECT id, url, title, tags, scan_time
      FROM news_history
      WHERE tags LIKE ?
      ORDER BY scan_time DESC
      LIMIT ?
    `;

    const stmt = d1.prepare(query);
    const results = await stmt.bind(`%${tagPattern}%`, Math.min(limit, 100)).raw();

    const items = (results.results || []).map((row: any) => ({
      id: row.id,
      url: row.url,
      title: row.title,
      tags: JSON.parse(row.tags || '[]'),
      scan_time: row.scan_time,
    }));

    return { items, count: items.length };
  } catch (error) {
    console.error('[trends/db/news] Query failed:', error);
    return { items: [], count: 0 };
  }
}

/**
 * Delete old news history
 */
export async function deleteOldNews(
  d1: D1Database,
  cutoffDate: string
): Promise<{ deleted: number; error?: string }> {
  try {
    const stmt = d1.prepare('DELETE FROM news_history WHERE scan_time < ?');
    const result = await stmt.bind(cutoffDate).run();

    return { deleted: result.meta?.changes || 0 };
  } catch (error: any) {
    console.error('[trends/db/news] Cleanup failed:', error);
    return { deleted: 0, error: error.message };
  }
}

/**
 * Get cutoff date for news retention
 */
export function getNewsCutoffDate(): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CONFIG.NEWS_RETENTION_DAYS);
  return cutoff.toISOString();
}
