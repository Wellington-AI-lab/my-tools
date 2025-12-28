/**
 * Trend Scanner Constants
 * Centralized configuration for maintainability
 */

export const CONFIG = {
  // API URLs
  NEWSNOW_API_URL: "https://newsbim.pages.dev/api/trends/aggregate",

  // Cache settings
  CACHE_KEY_PREFIX: "trends:scan",
  CACHE_TTL: 4 * 60 * 60, // 4 hours
  SCAN_WINDOW_MS: 4 * 60 * 60 * 1000, // 4 hour window

  // Processing limits
  AI_BATCH_SIZE: 20,
  MAX_TAGS_PER_ITEM: 5,
  MAX_KEYWORDS_PER_TITLE: 5,
  MAX_TOP_TAGS: 50,
  MAX_RETURNED_NEWS: 20,
  NEWS_HISTORY_BATCH_SIZE: 100,

  // AI settings
  AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
  AI_MAX_TOKENS: 1000,
  AI_API_TIMEOUT_MS: 25000,
  AI_DELAY_MS: 100,
  AI_MAX_CONCURRENT: 3,

  // Data retention
  SNAPSHOT_RETENTION_YEARS: 5,
  NEWS_RETENTION_DAYS: 7,

  // Query limits
  DEFAULT_QUERY_LIMIT: 100,
  MAX_TAG_LENGTH: 100,
} as const;

export type CacheWindow = number;

/**
 * Get the current 4-hour cache window index
 */
export function getCacheWindow(): CacheWindow {
  return Math.floor(Date.now() / CONFIG.SCAN_WINDOW_MS);
}

/**
 * Generate cache key for current window
 */
export function getCacheKey(): string {
  return `${CONFIG.CACHE_KEY_PREFIX}:${getCacheWindow()}`;
}

/**
 * Generate cache key for a specific window
 */
export function getCacheKeyForWindow(window: CacheWindow): string {
  return `${CONFIG.CACHE_KEY_PREFIX}:${window}`;
}

/**
 * Generate previous window key (for trend comparison)
 */
export function getPreviousWindowKey(currentWindow: CacheWindow): string {
  return getCacheKeyForWindow(currentWindow - 1);
}
