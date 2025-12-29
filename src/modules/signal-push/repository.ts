/**
 * Signal Push Repository - KV Deduplication Layer
 *
 * Tracks pushed article IDs to prevent duplicate notifications
 * Uses Vercel KV for persistent deduplication state
 */

import type { KVStorage } from '@/lib/storage/kv';
import type { PushStats } from './types';

// ============================================================================
// KV 存储键前缀
// ============================================================================

const KEYS = {
  PUSHED_IDS: 'signal-push:ids',           // Set of pushed article IDs (JSON array)
  PUSHED_ID: (id: string) => `signal-push:id:${id}`,  // Individual push record
  STATS: 'signal-push:stats',              // Push statistics
  LAST_PUSH: 'signal-push:last',           // Last push timestamp
} as const;

// ============================================================================
// TTL 配置
// ============================================================================

const TTL = {
  PUSHED_ID: 30 * 24 * 3600,  // 30 days - keep individual records for a month
  STATS: 90 * 24 * 3600,      // 90 days - keep stats longer
} as const;

// ============================================================================
// 去重操作
// ============================================================================

/**
 * Check if an article ID has already been pushed
 */
export async function isAlreadyPushed(
  kv: KVStorage,
  articleId: string
): Promise<boolean> {
  try {
    const result = await kv.get(KEYS.PUSHED_ID(articleId), { type: 'text' });
    return result !== null;
  } catch (error) {
    console.error('[signal-push/repository] Failed to check pushed status:', error);
    return false;
  }
}

/**
 * Mark an article as pushed
 */
export async function markAsPushed(
  kv: KVStorage,
  articleId: string
): Promise<void> {
  try {
    await kv.put(
      KEYS.PUSHED_ID(articleId),
      String(Date.now()),
      { expirationTtl: TTL.PUSHED_ID }
    );
  } catch (error) {
    console.error('[signal-push/repository] Failed to mark as pushed:', error);
  }
}

/**
 * Mark multiple articles as pushed (batch operation)
 */
export async function markManyAsPushed(
  kv: KVStorage,
  articleIds: string[]
): Promise<void> {
  try {
    const now = String(Date.now());
    await Promise.all(
      articleIds.map(id =>
        kv.put(KEYS.PUSHED_ID(id), now, { expirationTtl: TTL.PUSHED_ID })
      )
    );
  } catch (error) {
    console.error('[signal-push/repository] Failed to mark batch as pushed:', error);
  }
}

/**
 * Filter out articles that have already been pushed
 */
export async function filterUnpushed(
  kv: KVStorage,
  articleIds: string[]
): Promise<string[]> {
  try {
    const results = await Promise.all(
      articleIds.map(async (id) => ({
        id,
        pushed: await isAlreadyPushed(kv, id),
      }))
    );

    return results.filter(r => !r.pushed).map(r => r.id);
  } catch (error) {
    console.error('[signal-push/repository] Failed to filter unpushed:', error);
    return articleIds; // Return all on error to avoid missing pushes
  }
}

// ============================================================================
// 统计操作
// ============================================================================

/**
 * Get push statistics
 */
export async function getStats(
  kv: KVStorage
): Promise<PushStats> {
  const defaultStats: PushStats = {
    total_pushed: 0,
    telegram_sent: 0,
    lark_sent: 0,
    failed: 0,
    last_push_at: 0,
  };

  try {
    const result = await kv.get(KEYS.STATS, { type: 'json' });
    return result ? (result as PushStats) : defaultStats;
  } catch (error) {
    console.error('[signal-push/repository] Failed to get stats:', error);
    return defaultStats;
  }
}

/**
 * Update push statistics
 */
export async function updateStats(
  kv: KVStorage,
  updates: {
    telegram_sent?: number;
    lark_sent?: number;
    failed?: number;
  }
): Promise<PushStats> {
  const current = await getStats(kv);
  const now = Date.now();

  const newStats: PushStats = {
    total_pushed: current.total_pushed +
      (updates.telegram_sent || 0) + (updates.lark_sent || 0),
    telegram_sent: current.telegram_sent + (updates.telegram_sent || 0),
    lark_sent: current.lark_sent + (updates.lark_sent || 0),
    failed: current.failed + (updates.failed || 0),
    last_push_at: now,
  };

  try {
    await kv.put(KEYS.STATS, JSON.stringify(newStats), {
      expirationTtl: TTL.STATS,
    });
    await kv.put(KEYS.LAST_PUSH, String(now), { expirationTtl: TTL.STATS });
  } catch (error) {
    console.error('[signal-push/repository] Failed to update stats:', error);
  }

  return newStats;
}

/**
 * Get last push timestamp
 */
export async function getLastPushTime(
  kv: KVStorage
): Promise<number> {
  try {
    const result = await kv.get(KEYS.LAST_PUSH, { type: 'text' });
    return typeof result === 'string' ? parseInt(result, 10) : 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Record a successful push (marks as pushed and updates stats)
 */
export async function recordPush(
  kv: KVStorage,
  articleId: string,
  channel: 'telegram' | 'lark'
): Promise<void> {
  await markAsPushed(kv, articleId);

  const updateKey = channel === 'telegram' ? 'telegram_sent' : 'lark_sent';
  await updateStats(kv, { [updateKey]: 1 });
}

/**
 * Record a failed push attempt
 */
export async function recordFailure(
  kv: KVStorage
): Promise<void> {
  await updateStats(kv, { failed: 1 });
}
