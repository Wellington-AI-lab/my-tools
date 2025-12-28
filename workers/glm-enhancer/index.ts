/**
 * GLM Enhancement Worker
 *
 * A separate Cloudflare Worker that runs on a schedule to enhance
 * cached tags with GLM-4.7.
 *
 * Deployed independently from the Pages project.
 *
 * Usage:
 *   npx wrangler deploy glm-enhancer
 */

import { batchFuseTagsWithGLM } from './modules/glm';
import { batchFuseTags } from './modules/anthropic';

// Re-export types for TypeScript
export type { TagFusionInput, TagFusionResult } from './modules/glm';

// Types
interface NewsItemWithTags {
  id: string;
  title: string;
  url: string;
  tags: string[];
  tagScore: number;
}

interface TagStats {
  tag: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
}

interface ScanReport {
  generatedAt: string;
  newsCount: number;
  sources: string[];
  topTags: TagStats[];
  recentNews: NewsItemWithTags[];
  cached: boolean;
  scanId?: string;
  llmEnhanced?: number;
}

const ENHANCEMENT_LOCK_KEY = 'trends:enhancement:lock';
const LAST_ENHANCED_KEY = 'trends:enhancement:last';
const CACHE_KEY_PREFIX = 'trends:scan';

/**
 * Get cache key for current time window
 */
function getCacheKey(): string {
  const windowSize = 4 * 60 * 60 * 1000; // 4 hours
  const window = Math.floor(Date.now() / windowSize);
  return `${CACHE_KEY_PREFIX}:${window}`;
}

/**
 * Calculate tag stats with velocity detection
 */
function calculateTagStats(items: NewsItemWithTags[]): TagStats[] {
  const tagMap = new Map<string, number>();

  // Count tags
  for (const item of items) {
    for (const tag of item.tags) {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    }
  }

  // Convert to array and sort
  const sorted = Array.from(tagMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return sorted.slice(0, 50).map((item, index) => ({
    tag: item.tag,
    count: item.count,
    trend: 'stable' as const,
    changePercent: 0,
  }));
}

/**
 * Scheduled event handler
 */
export default {
  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext) {
    console.log('[glm-enhancer] Triggered at', new Date(event.scheduledTime).toISOString());

    const { KV, TRENDS_DB, GLM_API_KEY, ANTHROPIC_API_KEY } = env;

    // Check required bindings
    if (!KV) {
      console.error('[glm-enhancer] KV binding not found');
      return;
    }

    try {
      // Check if enhancement is already running
      const lock = await KV.get(ENHANCEMENT_LOCK_KEY);
      if (lock) {
        const lockTime = parseInt(lock);
        const elapsed = Date.now() - lockTime;
        if (elapsed < 15 * 60 * 1000) {
          console.log('[glm-enhancer] Already running, skipping');
          return;
        }
      }

      // Check last enhancement time
      const lastEnhanced = await KV.get(LAST_ENHANCED_KEY);
      const lastEnhancedTime = lastEnhanced ? new Date(lastEnhanced).getTime() : 0;
      const timeSinceLastEnhancement = Date.now() - lastEnhancedTime;

      // Only enhance if at least 30 minutes have passed
      if (timeSinceLastEnhancement < 30 * 60 * 1000) {
        console.log(`[glm-enhancer] Too soon (${Math.floor(timeSinceLastEnhancement / 60000)}min ago), skipping`);
        return;
      }

      // Set lock
      await KV.put(ENHANCEMENT_LOCK_KEY, Date.now().toString(), {
        expirationTtl: 900
      });

      // Run enhancement in background
      ctx.waitUntil(runEnhancement(env));

    } catch (error: any) {
      console.error('[glm-enhancer] Error:', error);
    }
  },
};

/**
 * Run GLM enhancement
 */
async function runEnhancement(env: any): Promise<void> {
  const startTime = Date.now();
  const { KV, TRENDS_DB, GLM_API_KEY, ANTHROPIC_API_KEY } = env;

  try {
    console.log('[glm-enhancer] Starting GLM enhancement...');

    // Get current cached report
    const cacheKey = getCacheKey();
    const cachedData = await KV.get(cacheKey);

    if (!cachedData) {
      console.log('[glm-enhancer] No cached report found');
      await KV.delete(ENHANCEMENT_LOCK_KEY);
      return;
    }

    const report: ScanReport = JSON.parse(cachedData);

    // Check if already enhanced
    if (report.llmEnhanced && report.llmEnhanced > 0) {
      console.log('[glm-enhancer] Already enhanced, skipping');
      await KV.delete(ENHANCEMENT_LOCK_KEY);
      await KV.put(LAST_ENHANCED_KEY, new Date().toISOString());
      return;
    }

    console.log(`[glm-enhancer] Processing ${report.recentNews.length} items...`);

    // Determine LLM provider
    const hasGLM = !!(GLM_API_KEY?.trim());
    const hasAnthropic = !!(ANTHROPIC_API_KEY?.trim());
    const llmProvider: 'glm' | 'anthropic' | 'none' = hasGLM ? 'glm' : hasAnthropic ? 'anthropic' : 'none';

    if (llmProvider === 'none') {
      console.log('[glm-enhancer] No LLM available');
      await KV.delete(ENHANCEMENT_LOCK_KEY);
      return;
    }

    console.log(`[glm-enhancer] Using ${llmProvider.toUpperCase()}`);

    // Prepare fusion input
    const fusionInput = report.recentNews.map(item => ({
      news: { id: item.id, title: item.title, url: item.url },
      cloudflareTags: item.tags,
    }));

    // Run LLM fusion
    let fusionResults: Map<string, any>;

    if (llmProvider === 'glm') {
      const glmConfig = {
        apiKey: GLM_API_KEY,
        model: 'glm-4-flash',
      };
      fusionResults = await batchFuseTagsWithGLM(fusionInput, glmConfig, 20);
    } else {
      const anthropicConfig = {
        apiKey: ANTHROPIC_API_KEY,
        model: 'claude-3-5-haiku-20241022',
      };
      fusionResults = await batchFuseTags(fusionInput, anthropicConfig, 20);
    }

    console.log(`[glm-enhancer] Enhanced ${fusionResults.size} items`);

    // Merge results
    const enhancedItems = report.recentNews.map(item => {
      const fusion = fusionResults.get(item.id);
      if (!fusion || !fusion.tags || fusion.tags.length === 0) {
        return item;
      }
      return {
        ...item,
        tags: fusion.tags.slice(0, 5),
        tagScore: 95,
      };
    });

    // Recalculate stats
    const topTags = calculateTagStats(enhancedItems);

    // Build enhanced report
    const enhancedReport: ScanReport = {
      ...report,
      topTags,
      recentNews: enhancedItems,
      llmEnhanced: fusionResults.size,
    };

    // Update cache
    await KV.put(cacheKey, JSON.stringify(enhancedReport), {
      expirationTtl: 4 * 60 * 60 // 4 hours
    });

    // Save to D1 if available
    if (TRENDS_DB) {
      try {
        const stmt = TRENDS_DB.prepare(
          'INSERT INTO tag_snapshots (scan_time, tag, count, rank, period) VALUES (?, ?, ?, ?, ?)'
        );
        const statements = topTags.slice(0, 20).map((tag, index) =>
          stmt.bind(report.generatedAt, tag.tag, tag.count, index + 1, '4h')
        );
        await TRENDS_DB.batch(statements);
        console.log(`[glm-enhancer] Saved ${topTags.slice(0, 20).length} snapshots to D1`);
      } catch (dbError) {
        console.error('[glm-enhancer] D1 save failed:', dbError);
      }
    }

    // Update last enhanced time
    await KV.put(LAST_ENHANCED_KEY, new Date().toISOString());

    // Clear lock
    await KV.delete(ENHANCEMENT_LOCK_KEY);

    const elapsed = Date.now() - startTime;
    console.log(`[glm-enhancer] Complete in ${elapsed}ms - ${fusionResults.size} items enhanced`);

  } catch (error) {
    console.error('[glm-enhancer] Failed:', error);
    await KV.delete(ENHANCEMENT_LOCK_KEY);
  }
}
