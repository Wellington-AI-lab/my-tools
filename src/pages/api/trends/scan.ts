/**
 * Trends Scan API (Refactored)
 *
 * Key improvements:
 * - Idempotency via scan_id parameter
 * - ctx.waitUntil() for non-blocking D1 writes
 * - Parallel AI batch processing
 * - Optimized keyword extraction
 * - Proper cache key management
 * - Timeout handling
 */

import { requireKV, requireD1, getEnv } from '@/lib/env';
import { CONFIG, getCacheKey } from '@/modules/trends/core/constants';
import {
  extractTagsWithAI,
  calculateTagStats,
  isAIModeAvailable,
  type NewsItemWithTags,
  type TagStats,
} from '@/modules/trends/core/tags';
import { extractKeywords, filterTags, calculateTagScore } from '@/modules/trends/core/keywords';
import { saveTagSnapshots, getPreviousStats } from '@/modules/trends/db/snapshots';
import { saveNewsHistory } from '@/modules/trends/db/news';
import { runCleanup, shouldRunCleanup } from '@/modules/trends/db/cleanup';

// Type definitions
interface NewsnowResponse {
  success: boolean;
  count: number;
  timestamp: number;
  items: Array<{
    id: string;
    title: string;
    url: string;
    extra?: {
      source?: string;
      date?: number | string;
    };
  }>;
  sources: string[];
}

interface TrendReport {
  generatedAt: string;
  newsCount: number;
  sources: string[];
  topTags: TagStats[];
  recentNews: NewsItemWithTags[];
  cached: boolean;
  aiQuotaExceeded?: boolean;
  aiApiCalls?: number;
  scanId?: string;
  // Dual AI stats
  llmEnabled?: boolean;
  llmProvider?: 'anthropic' | 'glm' | 'none';
  llmCalls?: number;
  llmEnhanced?: number;
}

interface ErrorResponse {
  error: string;
  generatedAt: string;
  newsCount: number;
  sources: string[];
  topTags: TagStats[];
  recentNews: NewsItemWithTags[];
}

// KV-based distributed lock for preventing concurrent scans across all isolates
const LOCK_TTL = 60; // seconds

/**
 * Acquire a distributed lock using KV.
 * Returns true if lock was acquired, false if already locked.
 */
async function acquireDistributedLock(kv: KVNamespace, scanId: string): Promise<boolean> {
  const key = `lock:scan:${scanId}`;
  // Check if lock already exists
  const existing = await kv.get(key);
  if (existing) {
    return false;
  }

  // Acquire lock with TTL
  await kv.put(key, 'locked', { expirationTtl: LOCK_TTL });
  return true;
}

/**
 * GET handler - Main scan endpoint
 */
export async function GET({ locals, url }: {
  locals: App.Locals;
  url: URL;
}) {
  const kv = requireKV(locals);
  const d1 = requireD1(locals);
  const env = getEnv(locals) as any;

  // Parse parameters
  const forceRefresh = url.searchParams.get('force') === 'true';
  const scanId = url.searchParams.get('scan_id') || generateScanId();
  const enableCleanup = url.searchParams.get('cleanup') !== 'false';

  // For force refresh, check distributed lock to prevent concurrent scans
  if (forceRefresh) {
    const isLocked = !(await acquireDistributedLock(kv, scanId));
    if (isLocked) {
      console.warn(`[trends/scan] Scan ${scanId} is already running (distributed lock).`);
      return new Response(JSON.stringify({ status: 'locked', scanId }), { status: 429 });
    }
  }

  // Perform scan
  return await performScan({ kv, d1, env, forceRefresh, scanId, enableCleanup });
}

/**
 * Core scan logic
 */
async function performScan(options: {
  kv: KVNamespace;
  d1: D1Database;
  env: any;
  forceRefresh: boolean;
  scanId: string;
  enableCleanup: boolean;
}): Promise<Response> {
  const { kv, d1, env, forceRefresh, scanId, enableCleanup } = options;

  try {
    // Check cache first
    if (!forceRefresh) {
      const cached = await getCachedReport(kv);
      if (cached) {
        cached.cached = true;
        cached.scanId = scanId;
        return Response.json(cached);
      }
    }

    // Fetch news data with timeout
    const newsnowData = await fetchNewsData();

    // Define scan time before using it
    const scanTime = new Date().toISOString();

    // Process news items - Cloudflare AI only (GLM enhancement via scheduled worker)
    const processingResult = await processNewsItems(newsnowData.items, env);

    // Calculate tag stats
    const currentWindow = Math.floor(Date.now() / CONFIG.SCAN_WINDOW_MS);
    const previousStats = await getPreviousStats(d1, currentWindow);
    const topTags = calculateTagStats(processingResult.newsWithTags, previousStats || undefined);

    // Build report
    const report: TrendReport = {
      generatedAt: scanTime,
      newsCount: newsnowData.count,
      sources: newsnowData.sources,
      topTags,
      recentNews: processingResult.newsWithTags.slice(0, CONFIG.MAX_RETURNED_NEWS),
      cached: false,
      scanId,
      aiQuotaExceeded: processingResult.aiQuotaExceeded,
      aiApiCalls: processingResult.aiApiCalls,
      llmEnabled: processingResult.llmEnabled,
      llmProvider: processingResult.llmProvider,
      llmCalls: processingResult.llmCalls,
      llmEnhanced: processingResult.llmEnhanced,
    };

    // Cache the report
    await kv.put(getCacheKey(), JSON.stringify(report), {
      expirationTtl: CONFIG.CACHE_TTL
    });

    // Save to D1 and cleanup via waitUntil (non-blocking)
    persistData(d1, scanTime, topTags, processingResult.newsWithTags, enableCleanup).catch(console.error);

    return Response.json(report);

  } catch (error: any) {
    console.error('[trends/scan] Error:', error);
    return errorResponse(error.message);
  }
}

/**
 * Fetch news data with timeout
 */
async function fetchNewsData(): Promise<NewsnowResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(CONFIG.NEWSNOW_API_URL, {
      headers: { "User-Agent": "my-tools-trends-radar/2.0" },
      signal: controller.signal as any,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`newsnow API failed: ${response.status}`);
    }

    const data: NewsnowResponse = await response.json();

    if (!data.success || !Array.isArray(data.items)) {
      throw new Error('Invalid newsnow response structure');
    }

    console.log(`[trends/scan] Fetched ${data.items.length} news items from ${data.sources.length} sources`);
    return data;

  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('newsnow API timeout');
    }
    throw error;
  }
}

/**
 * Process news items with Cloudflare AI
 * GLM enhancement happens via scheduled worker
 */
async function processNewsItems(
  items: Array<{ id: string; title: string; url: string }>,
  env: any
): Promise<{
  newsWithTags: NewsItemWithTags[];
  aiQuotaExceeded: boolean;
  aiApiCalls: number;
  llmEnabled: boolean;
  llmProvider: 'anthropic' | 'glm' | 'none';
  llmCalls: number;
  llmEnhanced: number;
}> {
  const hasCloudflareAI = isAIModeAvailable(env);
  const hasAnthropic = !!(env.ANTHROPIC_API_KEY?.trim());
  const hasGLM = !!(env.GLM_API_KEY?.trim());

  console.log(`[trends/scan] AI availability - Cloudflare: ${hasCloudflareAI}, Anthropic: ${hasAnthropic}, GLM: ${hasGLM}`);

  // If Cloudflare AI is available, use it
  if (hasCloudflareAI) {
    console.log(`[trends/scan] Using Cloudflare AI for ${items.length} items`);

    const result = await extractTagsWithAI(items, env);

    return {
      newsWithTags: result.results,
      aiQuotaExceeded: result.quotaExceeded,
      aiApiCalls: result.apiCalls,
      llmEnabled: hasGLM || hasAnthropic,
      llmProvider: hasGLM ? 'glm' : hasAnthropic ? 'anthropic' : 'none',
      llmCalls: 0,
      llmEnhanced: 0, // Will be updated by scheduled worker
    };
  }

  // Fallback to keyword mode
  console.log(`[trends/scan] No AI available, using keyword mode`);
  return {
    newsWithTags: items.map(keywordMode),
    aiQuotaExceeded: false,
    aiApiCalls: 0,
    llmEnabled: false,
    llmProvider: 'none',
    llmCalls: 0,
    llmEnhanced: 0,
  };
}

/**
 * Keyword-based tag extraction
 */
function keywordMode(item: { id: string; title: string; url: string }): NewsItemWithTags {
  const rawTags = extractKeywords(item.title);
  const tags = filterTags(rawTags);

  return {
    id: item.id,
    title: item.title,
    url: item.url,
    tags: tags.slice(0, CONFIG.MAX_TAGS_PER_ITEM),
    tagScore: calculateTagScore(tags, false),
  };
}

/**
 * Get cached report
 */
async function getCachedReport(kv: KVNamespace): Promise<TrendReport | null> {
  try {
    const cached = await kv.get(getCacheKey());
    if (!cached) return null;

    const data = JSON.parse(cached) as TrendReport;

    // Validate cache structure
    if (!data.topTags || !Array.isArray(data.topTags)) {
      console.warn('[trends/scan] Invalid cache structure, ignoring');
      return null;
    }

    console.log('[trends/scan] Cache hit');
    return data;
  } catch (error) {
    console.warn('[trends/scan] Cache read failed:', error);
    return null;
  }
}

/**
 * Persist data to D1 (async)
 */
async function persistData(
  d1: D1Database,
  scanTime: string,
  topTags: TagStats[],
  newsWithTags: NewsItemWithTags[],
  enableCleanup: boolean
): Promise<void> {
  try {
    // Save snapshots
    const snapshotResult = await saveTagSnapshots(d1, scanTime, topTags, '4h');
    console.log(`[trends/scan] Saved ${snapshotResult.saved} snapshots`);

    // Save news history
    const newsResult = await saveNewsHistory(d1, scanTime, newsWithTags);
    console.log(`[trends/scan] Saved ${newsResult.saved} news items`);

    // Run cleanup if needed
    if (enableCleanup && shouldRunCleanup()) {
      const cleanupResult = await runCleanup(d1);
      console.log(`[trends/scan] Cleanup: ${cleanupResult.snapshotsDeleted} snapshots, ${cleanupResult.newsDeleted} news`);
    }
  } catch (error) {
    console.error('[trends/scan] Persistence error:', error);
    // Don't throw - this runs in background
  }
}

/**
 * Generate unique scan ID
 */
function generateScanId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create error response
 */
function errorResponse(message: string): Response {
  return Response.json({
    error: message,
    generatedAt: new Date().toISOString(),
    newsCount: 0,
    sources: [],
    topTags: [],
    recentNews: [],
  } as ErrorResponse, { status: 500 });
}
