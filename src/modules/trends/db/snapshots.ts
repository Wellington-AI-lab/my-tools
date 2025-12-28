/**
 * Tag Snapshot Database Operations
 * Optimized for serverless edge environment
 */

import { CONFIG } from '../core/constants';
import type { TagStats } from '../core/tags';

export interface TagSnapshot {
  id?: number;
  scan_time: string;
  tag: string;
  count: number;
  rank: number;
  period: string;
}

/**
 * Save tag snapshots to D1 with error handling
 * Use batch operations for efficiency
 */
export async function saveTagSnapshots(
  d1: D1Database,
  scanTime: string,
  topTags: TagStats[],
  period: string = '4h'
): Promise<{ success: boolean; saved: number; error?: string }> {
  try {
    const stmt = d1.prepare(
      'INSERT INTO tag_snapshots (scan_time, tag, count, rank, period) VALUES (?, ?, ?, ?, ?)'
    );

    const statements = topTags.map((tag, index) =>
      stmt.bind(scanTime, tag.tag, tag.count, index + 1, period)
    );

    await d1.batch(statements);

    return { success: true, saved: topTags.length };
  } catch (error: any) {
    console.error('[trends/db/snapshots] Failed to save:', error);
    return { success: false, saved: 0, error: error.message };
  }
}

/**
 * Get previous tag stats for comparison
 */
export async function getPreviousStats(
  d1: D1Database,
  window: number
): Promise<Map<string, number> | null> {
  try {
    // Query the most recent snapshot before current window
    const stmt = d1.prepare(`
      SELECT tag, count, scan_time
      FROM tag_snapshots
      WHERE scan_time < datetime(? / 1000, 'unixepoch')
      ORDER BY scan_time DESC
      LIMIT 100
    `);

    const result = await stmt.bind(window * CONFIG.SCAN_WINDOW_MS).all();

    if (!result.results || result.results.length === 0) {
      return null;
    }

    // Return most recent counts per tag
    const tagMap = new Map<string, number>();
    const seenTags = new Set<string>();

    for (const row of result.results) {
      if (!seenTags.has(row.tag)) {
        tagMap.set(row.tag, row.count);
        seenTags.add(row.tag);
      }
    }

    return tagMap;
  } catch (error) {
    console.error('[trends/db/snapshots] Failed to get previous stats:', error);
    return null;
  }
}

/**
 * Delete old snapshots (for background cleanup)
 */
export async function deleteOldSnapshots(
  d1: D1Database,
  cutoffDate: string
): Promise<{ deleted: number; error?: string }> {
  try {
    const stmt = d1.prepare('DELETE FROM tag_snapshots WHERE scan_time < ?');
    const result = await stmt.bind(cutoffDate).run();

    return { deleted: result.meta?.changes || 0 };
  } catch (error: any) {
    console.error('[trends/db/snapshots] Cleanup failed:', error);
    return { deleted: 0, error: error.message };
  }
}

/**
 * Get cutoff date for data retention
 */
export function getSnapshotCutoffDate(): string {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - CONFIG.SNAPSHOT_RETENTION_YEARS);
  return cutoff.toISOString();
}
