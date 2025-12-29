/**
 * Signal Push Cron Job
 *
 * GET /api/cron/push
 *
 * Vercel Cron Job that:
 * 1. Fetches news from the last 4 hours with AI enrichment
 * 2. Filters for items with Signal Score > 8
 * 3. Formats a summary message
 * 4. Sends via Telegram/Lark webhook
 * 5. Tracks pushed IDs in KV for deduplication
 *
 * Environment Variables:
 * - CRON_SECRET: Secret for authenticating cron requests
 * - TELEGRAM_BOT_TOKEN: Telegram bot token (optional)
 * - TELEGRAM_CHAT_ID: Telegram chat ID (optional)
 * - LARK_WEBHOOK_URL: Lark webhook URL (optional)
 * - LLM_API_KEY, LLM_BASE_URL, LLM_MODEL: For AI enrichment
 *
 * Trigger: Every 4 hours via Vercel Cron
 */

import { requireKV, getEnv } from '@/lib/env';
import { enrichArticlesBatch, getCachedEnrichment } from '@/modules/news/ai-refinery';
import { getActiveSources } from '@/modules/intelligence/repository';
import type { IntelligenceSource } from '@/modules/intelligence/types';
import type { RawRssItem } from '@/modules/news/types';
import { processRefinery, parseRssXml, isValidRssContent } from '@/modules/news/refinery';
import type { RefinedArticle, EnrichedArticle } from '@/modules/news/types';
import { sendPush, sendPushAll } from '@/modules/signal-push/webhook';
import { filterUnpushed, markAsPushed, recordPush, recordFailure, getStats } from '@/modules/signal-push/repository';
import type { KVStorage } from '@/lib/storage/kv';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Time window to look back (4 hours)
  TIME_WINDOW_MS: 4 * 60 * 60 * 1000,

  // Minimum signal score for push (0-10)
  MIN_SIGNAL_SCORE: 8,

  // Max articles to push per run
  MAX_PUSHES_PER_RUN: 10,

  // Request timeout
  REQUEST_TIMEOUT_MS: 60000,
} as const;

// ============================================================================
// Default RSS Sources
// ============================================================================

const DEFAULT_RSS_SOURCES: IntelligenceSource[] = [
  {
    id: 1,
    name: 'Hacker News',
    url: 'https://news.ycombinator.com/rss',
    strategy: 'DIRECT' as const,
    rsshub_path: null,
    is_active: 1,
    weight: 1.0,
    reliability_score: 1.0,
    category: 'tech',
  },
  {
    id: 2,
    name: 'V2EX',
    url: 'https://www.v2ex.com/index.xml',
    strategy: 'DIRECT' as const,
    rsshub_path: null,
    is_active: 1,
    weight: 1.0,
    reliability_score: 1.0,
    category: 'tech',
  },
  {
    id: 3,
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    strategy: 'DIRECT' as const,
    rsshub_path: null,
    is_active: 1,
    weight: 0.8,
    reliability_score: 1.0,
    category: 'tech',
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verify cron secret
 */
function verifyCronSecret(request: Request): boolean {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '') ||
                request.headers.get('x-cron-secret') ||
                new URL(request.url).searchParams.get('secret');

  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.warn('[api/cron/push] CRON_SECRET not configured, allowing request');
    return true;
  }

  return secret === expectedSecret;
}

/**
 * Fetch RSS sources
 */
async function fetchRssSource(
  source: IntelligenceSource,
  rsshubBaseUrl?: string
): Promise<{ source: string; items: RawRssItem[]; error?: string }> {
  try {
    const url = source.strategy === 'RSSHUB'
      ? `${rsshubBaseUrl || 'https://rsshub.app'}${source.rsshub_path}`
      : source.url;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SignalPush/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { source: source.name, items: [], error: `HTTP ${response.status}` };
    }

    const text = await response.text();
    if (!isValidRssContent(text)) {
      return { source: source.name, items: [], error: 'Invalid RSS content' };
    }

    const items = parseRssXml(text, source.name);
    return { source: source.name, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { source: source.name, items: [], error: message };
  }
}

/**
 * Get sources (database or default)
 */
async function getSources(locals: App.Locals): Promise<IntelligenceSource[]> {
  try {
    const { getIntelligenceDB } = await import('@/lib/env');
    const db = getIntelligenceDB(locals);
    if (db) {
      const sources = await getActiveSources(db);
      if (sources.length > 0) return sources;
    }
  } catch (error) {
    console.warn('[api/cron/push] Failed to get sources from database:', error);
  }
  return DEFAULT_RSS_SOURCES;
}

/**
 * Filter articles by time window
 */
function filterByTimeWindow(articles: RefinedArticle[], since: number): RefinedArticle[] {
  return articles.filter(a => a.published_at >= since);
}

// ============================================================================
// Main Handler
// ============================================================================

interface PushResponse {
  success: boolean;
  summary: {
    total_fetched: number;
    after_filter: number;
    high_signal: number;
    new_pushes: number;
    telegram_sent: number;
    lark_sent: number;
    failed: number;
  };
  stats?: {
    total_pushed: number;
    last_push_at: number;
  };
  error?: string;
  pushed_articles?: Array<{
    title: string;
    signal_score: number;
    category: string;
  }>;
}

export async function GET({ locals, request }: {
  locals: App.Locals;
  request: Request;
}) {
  const startTime = Date.now();

  // 1. Verify cron secret
  if (!verifyCronSecret(request)) {
    return Response.json({
      success: false,
      error: 'Unauthorized: Invalid CRON_SECRET',
    } as PushResponse, { status: 401 });
  }

  const kv = requireKV(locals);
  const env = locals.runtime?.env as VercelEnv;
  const envVars = getEnv(locals);

  // 2. Check if at least one push channel is configured
  const hasTelegram = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  const hasLark = !!process.env.LARK_WEBHOOK_URL;

  if (!hasTelegram && !hasLark) {
    return Response.json({
      success: false,
      error: 'No push channel configured. Set TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID or LARK_WEBHOOK_URL',
    } as PushResponse, { status: 400 });
  }

  try {
    // 3. Fetch news from last 4 hours
    const timeWindowStart = Math.floor((Date.now() - CONFIG.TIME_WINDOW_MS) / 1000);
    console.log(`[api/cron/push] Fetching news since ${new Date(timeWindowStart * 1000).toISOString()}`);

    const sources = await getSources(locals);
    console.log(`[api/cron/push] Using ${sources.length} sources`);

    // Fetch all sources
    const rsshubBaseUrl = env?.RSSHUB_BASE_URL?.trim();
    const fetchResults = await Promise.all(
      sources.map(s => fetchRssSource(s, rsshubBaseUrl))
    );

    const allItems: RawRssItem[] = [];
    for (const result of fetchResults) {
      if (result.error) {
        console.warn(`[api/cron/push] Source ${result.source} failed: ${result.error}`);
      }
      allItems.push(...result.items);
    }

    console.log(`[api/cron/push] Fetched ${allItems.length} raw items`);

    // 4. Process through refinery
    const { articles } = processRefinery(allItems);
    const timeFiltered = filterByTimeWindow(articles, timeWindowStart);

    console.log(`[api/cron/push] After refinery: ${articles.length}, after time filter: ${timeFiltered.length}`);

    // 5. Attach cached AI enrichment (fast path, no LLM calls)
    const enrichmentResults = await Promise.allSettled(
      timeFiltered.map(article => getCachedEnrichment(kv, article.url))
    );

    const enriched: EnrichedArticle[] = [];
    let cachedCount = 0;

    for (let i = 0; i < enrichmentResults.length; i++) {
      const result = enrichmentResults[i];
      const article = timeFiltered[i];

      if (result.status === 'fulfilled' && result.value) {
        enriched.push({
          ...article,
          ai_enriched: true,
          ai_category: result.value.category,
          ai_bottom_line: result.value.bottom_line,
          ai_signal_score: result.value.signal_score,
          ai_key_insights: result.value.key_insights,
        });
        cachedCount++;
      }
    }

    console.log(`[api/cron/push] Attached ${cachedCount} cached enrichments`);

    // 6. Filter for high-signal items
    const highSignal = enriched.filter(a =>
      a.ai_signal_score >= CONFIG.MIN_SIGNAL_SCORE &&
      a.ai_category !== 'noise'
    );

    console.log(`[api/cron/push] High-signal items (score >= ${CONFIG.MIN_SIGNAL_SCORE}): ${highSignal.length}`);

    // 7. Filter out already pushed items
    const articleIds = highSignal.map(a => a.id);
    const unpushedIds = await filterUnpushed(kv, articleIds);
    const unpushedArticles = highSignal.filter(a => unpushedIds.includes(a.id));

    console.log(`[api/cron/push] New items to push: ${unpushedArticles.length}`);

    if (unpushedArticles.length === 0) {
      const stats = await getStats(kv);
      return Response.json({
        success: true,
        summary: {
          total_fetched: allItems.length,
          after_filter: timeFiltered.length,
          high_signal: highSignal.length,
          new_pushes: 0,
          telegram_sent: 0,
          lark_sent: 0,
          failed: 0,
        },
        stats,
      } as PushResponse);
    }

    // 8. Limit pushes per run
    const toPush = unpushedArticles.slice(0, CONFIG.MAX_PUSHES_PER_RUN);
    console.log(`[api/cron/push] Pushing ${toPush.length} articles (max: ${CONFIG.MAX_PUSHES_PER_RUN})`);

    // 9. Send push notifications
    const pushConfig = {
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID,
      larkWebhookUrl: process.env.LARK_WEBHOOK_URL,
    };

    let telegramSent = 0;
    let larkSent = 0;
    let failed = 0;

    const pushedArticles: Array<{ title: string; signal_score: number; category: string }> = [];

    for (const article of toPush) {
      try {
        const results = await sendPushAll({
          category: article.ai_category,
          title: article.title,
          bottom_line: article.ai_bottom_line,
          signal_score: article.ai_signal_score,
          url: article.url,
          source: article.source,
        }, pushConfig);

        for (const result of results) {
          if (result.success) {
            if (result.channel === 'telegram') telegramSent++;
            if (result.channel === 'lark') larkSent++;
            await markAsPushed(kv, article.id);
          } else {
            console.error(`[api/cron/push] Push failed for ${article.id}:`, result.error);
            failed++;
            await recordFailure(kv);
          }
        }

        pushedArticles.push({
          title: article.title,
          signal_score: article.ai_signal_score,
          category: article.ai_category,
        });

        // Rate limiting: small delay between pushes
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`[api/cron/push] Error pushing article ${article.id}:`, error);
        failed++;
        await recordFailure(kv);
      }
    }

    // 10. Get updated stats
    const stats = await getStats(kv);

    const duration = Date.now() - startTime;
    console.log(`[api/cron/push] Complete in ${duration}ms. Sent: ${telegramSent + larkSent}, Failed: ${failed}`);

    return Response.json({
      success: true,
      summary: {
        total_fetched: allItems.length,
        after_filter: timeFiltered.length,
        high_signal: highSignal.length,
        new_pushes: toPush.length,
        telegram_sent: telegramSent,
        lark_sent: larkSent,
        failed,
      },
      stats,
      pushed_articles: pushedArticles,
    } as PushResponse);

  } catch (error: any) {
    console.error('[api/cron/push] Error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error',
    } as PushResponse, { status: 500 });
  }
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Secret',
    },
  });
}
