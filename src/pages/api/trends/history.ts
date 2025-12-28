/**
 * Trends History API (Refactored)
 *
 * Improvements:
 * - Unified query builder
 * - Proper error responses
 * - Type safety
 * - Optimized SQL queries
 */

import { requireD1 } from '@/lib/env';

// Type definitions
interface QueryParams {
  tag?: string;
  days?: number;
  hours?: number;
  limit?: number;
  mode?: string;
}

interface HistoryResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  period?: { start: string; end: string };
}

interface TagSnapshot {
  scan_time: string;
  tag: string;
  count: number;
  rank: number;
}

interface TrendPoint {
  time: string;
  count: number;
  rank: number;
}

interface TagHistory {
  tag: string;
  data: TrendPoint[];
  currentCount: number;
  currentRank: number;
  velocity: number;
  acceleration: number;
  trend: 'up' | 'down' | 'stable';
}

// Constants
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MIN_DAYS = 1;
const MAX_DAYS = 365;

/**
 * GET handler
 */
export async function GET({ locals, url }: { locals: App.Locals; url: URL }): Promise<Response> {
  const d1 = requireD1(locals);
  const params = parseQueryParams(url);

  try {
    const startTime = calculateStartTime(params.days, params.hours);

    switch (params.mode) {
      case 'velocity':
        return await getVelocityAnalysis(d1, startTime, params.limit);

      case 'persistent':
        return await getPersistentTags(d1, startTime, params.limit);

      case 'top':
        return await getTopTags(d1, startTime, params.limit);

      case 'realtime':
        return await getRealtimeTags(d1, startTime, params.limit);

      default:
        if (params.tag) {
          return await getTagHistory(d1, params.tag, startTime, params.limit);
        }
        return await getLatestTags(d1, params.limit);
    }
  } catch (error: any) {
    console.error('[trends/history] Error:', error);
    return errorResponse(error.message);
  }
}

/**
 * Parse and validate query parameters
 */
function parseQueryParams(url: URL): QueryParams {
  const days = clamp(parseInt(url.searchParams.get('days') || '7'), MIN_DAYS, MAX_DAYS);
  const hours = clamp(parseInt(url.searchParams.get('hours') || '0'), 0, 24 * 7); // Max 1 week
  const limit = clamp(parseInt(url.searchParams.get('limit') || '100'), 1, MAX_LIMIT);
  const mode = url.searchParams.get('mode') || 'tag';
  const tag = sanitizeTag(url.searchParams.get('tag'));

  return { days, hours, limit, mode, tag: tag || undefined };
}

/**
 * Calculate start time from parameters
 */
function calculateStartTime(days: number, hours: number): string {
  const ms = hours > 0
    ? hours * 60 * 60 * 1000
    : days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

/**
 * Get tag history
 */
async function getTagHistory(
  d1: D1Database,
  tag: string,
  startTime: string,
  limit: number
): Promise<Response> {
  const stmt = d1.prepare(`
    SELECT scan_time, tag, count, rank
    FROM tag_snapshots
    WHERE tag = ? AND scan_time >= ?
    ORDER BY scan_time DESC
    LIMIT ?
  `);

  const result = await stmt.bind(tag, startTime, limit).all<TagSnapshot>();
  const snapshots = result.results || [];

  if (snapshots.length === 0) {
    return Response.json({
      tag,
      data: [],
      currentCount: 0,
      currentRank: 0,
      velocity: 0,
      acceleration: 0,
      trend: 'stable' as const
    });
  }

  const data = snapshots
    .reverse()
    .map(s => ({ time: s.scan_time, count: s.count, rank: s.rank }));

  const { velocity, acceleration, trend } = calculateVelocity(data);
  const latest = snapshots[0];

  return Response.json({
    tag,
    data,
    currentCount: latest.count,
    currentRank: latest.rank,
    velocity,
    acceleration,
    trend
  });
}

/**
 * Get velocity analysis (fastest growing tags)
 */
async function getVelocityAnalysis(
  d1: D1Database,
  startTime: string,
  limit: number
): Promise<Response> {
  const midTime = new Date(
    Date.now() - (Date.now() - new Date(startTime).getTime()) / 2
  ).toISOString();

  const stmt = d1.prepare(`
    SELECT
      tag,
      SUM(CASE WHEN scan_time >= ? THEN count ELSE 0 END) as recent_count,
      SUM(CASE WHEN scan_time < ? THEN count ELSE 0 END) as previous_count
    FROM tag_snapshots
    WHERE scan_time >= ?
    GROUP BY tag
    HAVING recent_count > 0
    ORDER BY (recent_count - previous_count) DESC
    LIMIT ?
  `);

  const result = await stmt.bind(midTime, midTime, startTime, limit).all();

  const items = (result.results || []).map((row: any) => {
    const recentCount = row.recent_count || 0;
    const previousCount = row.previous_count || 0;
    const velocity = recentCount - previousCount;
    const percentChange = previousCount > 0 ? (velocity / previousCount) * 100 : 100;

    return {
      tag: row.tag,
      currentCount: recentCount,
      previousCount,
      velocity,
      percentChange: Math.round(percentChange * 10) / 10,
      trend: getTrendDirection(velocity, 5)
    };
  });

  // Return format expected by frontend: { items, period }
  return Response.json({
    items,
    period: { start: startTime, end: new Date().toISOString() }
  });
}

/**
 * Get persistent tags (long-running hot topics)
 */
async function getPersistentTags(
  d1: D1Database,
  startTime: string,
  limit: number
): Promise<Response> {
  const stmt = d1.prepare(`
    SELECT
      tag,
      COUNT(*) as appearance_count,
      AVG(count) as avg_count,
      MAX(count) as max_count,
      MIN(rank) as best_rank
    FROM tag_snapshots
    WHERE scan_time >= ?
    GROUP BY tag
    HAVING appearance_count >= 3
    ORDER BY avg_count DESC, appearance_count DESC
    LIMIT ?
  `);

  const result = await stmt.bind(startTime, limit).all();

  const items = (result.results || []).map((row: any) => ({
    tag: row.tag,
    appearanceCount: row.appearance_count,
    avgCount: Math.round(row.avg_count),
    maxCount: row.max_count,
    bestRank: row.best_rank
  }));

  // Return format expected by frontend: { items, period }
  return Response.json({
    items,
    period: { start: startTime, end: new Date().toISOString() }
  });
}

/**
 * Get top tags for period
 */
async function getTopTags(
  d1: D1Database,
  startTime: string,
  limit: number
): Promise<Response> {
  const stmt = d1.prepare(`
    SELECT
      tag,
      SUM(count) as total_count,
      COUNT(*) as appearance_count,
      AVG(rank) as avg_rank
    FROM tag_snapshots
    WHERE scan_time >= ?
    GROUP BY tag
    ORDER BY total_count DESC
    LIMIT ?
  `);

  const result = await stmt.bind(startTime, limit).all();

  const items = (result.results || []).map((row: any) => ({
    tag: row.tag,
    totalCount: row.total_count,
    appearanceCount: row.appearance_count,
    avgRank: Math.round(row.avg_rank)
  }));

  // Return format expected by frontend: { items, period }
  return Response.json({
    items,
    period: { start: startTime, end: new Date().toISOString() }
  });
}

/**
 * Get realtime aggregated tags
 */
async function getRealtimeTags(
  d1: D1Database,
  startTime: string,
  limit: number
): Promise<Response> {
  const stmt = d1.prepare(`
    SELECT
      tag,
      SUM(count) as total_count,
      COUNT(*) as appearance_count,
      AVG(count) as avg_count,
      MAX(count) as max_count
    FROM tag_snapshots
    WHERE scan_time >= ?
    GROUP BY tag
    ORDER BY total_count DESC
    LIMIT ?
  `);

  const result = await stmt.bind(startTime, limit).all();

  const items = (result.results || []).map((row: any) => ({
    tag: row.tag,
    totalCount: row.total_count,
    avgCount: Math.round(row.avg_count),
    appearanceCount: row.appearance_count
  }));

  // Return format expected by frontend: { items, period }
  return Response.json({
    items,
    period: { start: startTime, end: new Date().toISOString() }
  });
}

/**
 * Get latest tags
 */
async function getLatestTags(d1: D1Database, limit: number): Promise<Response> {
  const stmt = d1.prepare(`
    SELECT scan_time, tag, count, rank
    FROM tag_snapshots
    WHERE scan_time = (
      SELECT MAX(scan_time) FROM tag_snapshots
    )
    ORDER BY rank
    LIMIT ?
  `);

  const result = await stmt.bind(limit).all();

  const items = (result.results || []).map((row: any) => ({
    tag: row.tag,
    count: row.count,
    rank: row.rank,
    scanTime: row.scan_time
  }));

  return Response.json({
    scanTime: items.length > 0 ? items[0].scanTime : null,
    items
  });
}

// Utility functions

function calculateVelocity(data: TrendPoint[]): {
  velocity: number;
  acceleration: number;
  trend: 'up' | 'down' | 'stable';
} {
  const velocity = data.length >= 2
    ? data[data.length - 1].count - data[data.length - 2].count
    : 0;

  const acceleration = data.length >= 3
    ? (data[data.length - 1].count - data[data.length - 2].count) -
      (data[data.length - 2].count - data[data.length - 3].count)
    : 0;

  const trend = getTrendDirection(velocity, 2);

  return { velocity, acceleration, trend };
}

function getTrendDirection(
  value: number,
  threshold: number
): 'up' | 'down' | 'stable' {
  if (value > threshold) return 'up';
  if (value < -threshold) return 'down';
  return 'stable';
}

function sanitizeTag(tag: string | null): string | null {
  if (!tag) return null;
  const sanitized = tag.trim().slice(0, 100);
  return sanitized || null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function errorResponse(message: string): Response {
  return Response.json({
    success: false,
    error: message
  }, { status: 500 });
}
