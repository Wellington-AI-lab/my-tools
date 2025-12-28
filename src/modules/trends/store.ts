/**
 * Pure D1 Store for Trends Reports
 *
 * Architecture: Single table (trend_reports) stores both index and payload.
 * - No KV dependency for index storage
 * - No fallback logic (D1 is required)
 * - Atomic operations guaranteed by SQLite's row-level locking
 *
 * Migration: 0003_single_table_reports.sql
 */

import type { TrendsReport } from '@/modules/trends/types';
import type { AliasRule } from '@/modules/trends/normalize';

// ============================================================================
// SQL Statements
// ============================================================================

const SQL_UPSERT_REPORT = `
  INSERT INTO trend_reports (day_key, payload)
  VALUES (?, ?)
  ON CONFLICT(day_key) DO UPDATE SET payload = excluded.payload
`;

const SQL_GET_LATEST = `
  SELECT payload FROM trend_reports
  ORDER BY day_key DESC
  LIMIT 1
`;

const SQL_GET_REPORT = `
  SELECT payload FROM trend_reports
  WHERE day_key = ?
  LIMIT 1
`;

const SQL_GET_HISTORY = `
  SELECT payload FROM trend_reports
  ORDER BY day_key DESC
  LIMIT ?
`;

const SQL_DELETE_OLD = `
  DELETE FROM trend_reports
  WHERE created_at < datetime('now', '-' || ? || ' days')
`;

const SQL_GET_INDEX = `
  SELECT day_key FROM trend_reports
  ORDER BY day_key DESC
  LIMIT ?
`;

// KV keys (only for latest cache - optional optimization)
const KV_KEY_LATEST = 'trends:latest';
const KV_KEY_ALIASES = 'trends:aliases';
const KV_KEY_NEWS_KEYWORDS = 'news:keywords:latest';

// ============================================================================
// Configuration
// ============================================================================

const INDEX_RETENTION_DAYS = 14;
const KV_CACHE_TTL = 60 * 60; // 1 hour cache for latest

// D1 single-row limit is 1MB; set safe threshold at 900KB
const MAX_PAYLOAD_SIZE = 900_000;

// ============================================================================
// Core Operations (D1-only)
// ============================================================================

/**
 * Store a trends report in D1.
 * Single atomic operation - no race conditions possible.
 */
export async function putTrendsReport(
  d1: D1Database,
  report: TrendsReport,
  kv?: KVNamespace | null
): Promise<void> {
  const dayKey = String(report?.meta?.day_key || '').trim();
  if (!dayKey) throw new Error('report.meta.day_key is missing');

  const payload = JSON.stringify(report);

  // Safety check: D1 single-row limit is 1MB
  if (payload.length > MAX_PAYLOAD_SIZE) {
    throw new Error(
      `Report payload too large: ${(payload.length / 1024).toFixed(2)}KB exceeds limit of ${(MAX_PAYLOAD_SIZE / 1024)}KB. ` +
      `Consider reducing cards count or implementing pagination.`
    );
  }

  // Atomic upsert - single network roundtrip
  await d1.prepare(SQL_UPSERT_REPORT).bind(dayKey, payload).run();

  // Optional: cache latest in KV for faster reads (fire-and-forget)
  if (kv) {
    kv.put(KV_KEY_LATEST, payload, { expirationTtl: KV_CACHE_TTL }).catch(() => {});
  }

  // Update keywords cache for news feed (optional optimization)
  if (kv) {
    const keywords = extractKeywordsForNews(report);
    kv.put(KV_KEY_NEWS_KEYWORDS, JSON.stringify({
      keywords,
      updatedAt: new Date().toISOString(),
      fromDayKey: dayKey,
    }), { expirationTtl: KV_CACHE_TTL }).catch(() => {});
  }
}

/**
 * Get the latest trends report.
 * Tries KV cache first, falls back to D1.
 */
export async function getLatestTrendsReport(
  d1: D1Database,
  kv?: KVNamespace | null
): Promise<TrendsReport | null> {
  // Try KV cache first (optional fast path)
  if (kv) {
    const cached = await kv.get(KV_KEY_LATEST, 'json');
    if (cached && typeof cached === 'object') {
      return cached as TrendsReport;
    }
  }

  // Fall back to D1 (source of truth)
  const row = await d1.prepare(SQL_GET_LATEST).first<{ payload: string }>();
  if (!row) return null;

  try {
    return JSON.parse(row.payload) as TrendsReport;
  } catch {
    return null;
  }
}

/**
 * Get a specific report by day_key.
 */
export async function getTrendsReport(
  d1: D1Database,
  dayKey: string
): Promise<TrendsReport | null> {
  const row = await d1.prepare(SQL_GET_REPORT).bind(dayKey).first<{ payload: string }>();
  if (!row) return null;

  try {
    return JSON.parse(row.payload) as TrendsReport;
  } catch {
    return null;
  }
}

/**
 * Get historical reports.
 */
export async function getTrendsHistory(
  d1: D1Database,
  limit = 7
): Promise<TrendsReport[]> {
  const effectiveLimit = Math.max(1, Math.min(INDEX_RETENTION_DAYS, Math.floor(limit || 7)));
  const rows = await d1.prepare(SQL_GET_HISTORY).bind(effectiveLimit).all<{ payload: string }>();

  return rows.results
    .map(row => {
      try {
        return JSON.parse(row.payload) as TrendsReport;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as TrendsReport[];
}

/**
 * Get list of available day keys (index only, no payloads).
 */
export async function getTrendsIndex(
  d1: D1Database,
  limit = INDEX_RETENTION_DAYS
): Promise<string[]> {
  const rows = await d1.prepare(SQL_GET_INDEX).bind(limit).all<{ day_key: string }>();
  return rows.results.map(r => r.day_key);
}

// ============================================================================
// Cleanup Operations
// ============================================================================

/**
 * Delete reports older than retention days.
 * Call this from a Cron job (e.g., daily).
 */
export async function deleteOldReports(
  d1: D1Database,
  retentionDays = INDEX_RETENTION_DAYS
): Promise<{ count: number }> {
  const result = await d1.prepare(SQL_DELETE_OLD).bind(retentionDays).run();
  return { count: result.meta.changes ?? 0 };
}

// ============================================================================
// Aliases (still stored in KV - low-frequency data)
// ============================================================================

export async function getTrendsAliases(kv: KVNamespace): Promise<AliasRule[]> {
  const data = await kv.get(KV_KEY_ALIASES, 'json');
  return Array.isArray(data) ? data : [];
}

export async function putTrendsAliases(kv: KVNamespace, rules: AliasRule[]): Promise<void> {
  const safe = Array.isArray(rules) ? rules : [];
  await kv.put(KV_KEY_ALIASES, JSON.stringify(safe));
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract keywords from report for news feed integration.
 */
function extractKeywordsForNews(report: TrendsReport): Record<string, string[]> {
  const result: Record<string, string[]> = {
    finance: [],
    economy: [],
    ai: [],
  };

  for (const group of report.trends_by_theme || []) {
    const theme = group.theme;
    if (theme === 'finance' || theme === 'economy' || theme === 'ai') {
      result[theme] = [...new Set((group.keywords || []).slice(0, 10))];
    }
  }

  // Default keywords if empty
  if (result.finance.length === 0) {
    result.finance = ['股市', '美股', 'A股', '降息', '美联储'];
  }
  if (result.economy.length === 0) {
    result.economy = ['GDP', 'CPI', '通胀', '就业', '经济'];
  }
  if (result.ai.length === 0) {
    result.ai = ['AI', '人工智能', 'ChatGPT', 'OpenAI', '大模型'];
  }

  return result;
}

/**
 * Get keywords for news feed (from KV cache).
 */
export async function getNewsKeywords(kv: KVNamespace): Promise<{
  keywords: Record<string, string[]>;
  updatedAt: string;
  fromDayKey: string;
} | null> {
  const data = await kv.get(KV_KEY_NEWS_KEYWORDS, 'json');
  return data as { keywords: Record<string, string[]>; updatedAt: string; fromDayKey: string } | null;
}

// ============================================================================
// Utilities
// ============================================================================

export function trendsDayKey(dayKey: string): string {
  return `trends:daily:${dayKey}`;
}
