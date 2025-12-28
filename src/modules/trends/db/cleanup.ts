/**
 * Async Cleanup Operations
 * Designed to run via ctx.waitUntil() after response is sent
 */

import { getSnapshotCutoffDate, deleteOldSnapshots } from './snapshots';
import { getNewsCutoffDate, deleteOldNews } from './news';

export interface CleanupResult {
  snapshotsDeleted: number;
  newsDeleted: number;
  errors: string[];
}

/**
 * Run cleanup operations asynchronously
 * Safe to call via ctx.waitUntil()
 */
export async function runCleanup(d1: D1Database): Promise<CleanupResult> {
  const result: CleanupResult = {
    snapshotsDeleted: 0,
    newsDeleted: 0,
    errors: [],
  };

  // Clean old snapshots
  try {
    const snapshotResult = await deleteOldSnapshots(d1, getSnapshotCutoffDate());
    result.snapshotsDeleted = snapshotResult.deleted;
    if (snapshotResult.error) {
      result.errors.push(`Snapshots: ${snapshotResult.error}`);
    }
  } catch (error: any) {
    result.errors.push(`Snapshots: ${error.message}`);
  }

  // Clean old news
  try {
    const newsResult = await deleteOldNews(d1, getNewsCutoffDate());
    result.newsDeleted = newsResult.deleted;
    if (newsResult.error) {
      result.errors.push(`News: ${newsResult.error}`);
    }
  } catch (error: any) {
    result.errors.push(`News: ${error.message}`);
  }

  if (result.snapshotsDeleted > 0 || result.newsDeleted > 0) {
    console.log(`[trends/cleanup] Deleted ${result.snapshotsDeleted} snapshots, ${result.newsDeleted} news`);
  }

  return result;
}

/**
 * Check if cleanup should run (probabilistic)
 * Runs approximately once per day (1/6 chance per 4-hour scan)
 */
export function shouldRunCleanup(): boolean {
  // Use day of month and hour to determine
  const now = new Date();
  const dayHash = now.getDate() + now.getHours();
  return dayHash % 6 === 0;
}
