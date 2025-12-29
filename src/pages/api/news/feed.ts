/**
 * News Feed API - Refinery 模式后端处理
 *
 * GET /api/news/feed
 *
 * Query Parameters:
 * - source: (optional) 按来源筛选
 * - page: (optional) 页码，默认 1
 * - limit: (optional) 每页数量，默认 20
 * - refresh: (optional) 强制刷新缓存，设为 'true' 时跳过缓存
 * - since: (optional) Unix 时间戳，只返回该时间之后的文章
 * - summarize: (optional) AI 增强模式
 *   - omit / false: 返回原始文章
 *   - "cached": 仅附加已缓存的 AI 增强结果 (快速路径，无 LLM 调用)
 *   - "true": 启用实时 AI 处理 (可能超时，不推荐)
 * - category: (optional) 按 AI 分类筛选 (summarize 时有效)
 * - minSignal: (optional) 最小信号分数 0-10 (summarize 时有效)
 *
 * Async-First Architecture:
 * 1. Default: Returns raw RSS data fast (< 2s)
 * 2. summarize=cached: Attaches pre-cached AI insights only (fast)
 * 3. Client calls /api/news/summarize per-item on-demand (lazy)
 *
 * Response:
 * {
 *   success: true,
 *   data: RefinedArticle[] | EnrichedArticle[],
 *   stats: RefineryStats,
 *   cached: boolean,
 *   timestamp: string,
 *   hasMore: boolean,
 *   ai_enriched?: boolean,
 *   llm_configured?: boolean
 * }
 */

import { requireKV, getEnv } from '@/lib/env';
import { enrichArticlesBatch } from '@/modules/news/ai-refinery';
import { getCachedEnrichment } from '@/modules/news/ai-refinery';
import type { EnrichedArticle } from '@/modules/news/types';
import { getActiveSources } from '@/modules/intelligence/repository';
import type { IntelligenceSource } from '@/modules/intelligence/types';
import type { RawRssItem } from '@/modules/news/types';
import {
  processRefinery,
  parseRssXml,
  isValidRssContent,
  createCacheKey,
} from '@/modules/news/refinery';
import {
  getCachedFeed,
  setCachedFeed,
  getPaginatedArticles,
  updateSourceStats,
} from '@/modules/news/repository';
import type { FeedResponse, RefinedArticle } from '@/modules/news/types';
import type { KVStorage } from '@/lib/storage/kv';

// ============================================================================
// 默认 RSS 源配置 (当 D1 没有配置时使用)
// ============================================================================

const DEFAULT_RSS_SOURCES = [
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
    name: '36氪',
    url: '',
    strategy: 'RSSHUB' as const,
    rsshub_path: '/36kr',
    is_active: 1,
    weight: 1.0,
    reliability_score: 1.0,
    category: 'tech',
  },
  {
    id: 4,
    name: '少数派',
    url: '',
    strategy: 'RSSHUB' as const,
    rsshub_path: '/sspai',
    is_active: 1,
    weight: 1.0,
    reliability_score: 1.0,
    category: 'tech',
  },
  {
    id: 5,
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
// Fetch 帮助函数
// ============================================================================

/**
 * 获取源列表 (优先使用数据库，否则使用默认配置)
 */
async function getSources(locals: App.Locals): Promise<IntelligenceSource[]> {
  try {
    const { getIntelligenceDB } = await import('@/lib/env');
    const db = getIntelligenceDB(locals);
    if (db) {
      const sources = await getActiveSources(db);
      if (sources.length > 0) {
        return sources;
      }
    }
  } catch (error) {
    console.warn('[api/news/feed] Failed to get sources from database, using defaults:', error);
  }

  return DEFAULT_RSS_SOURCES;
}

/**
 * 抓取单个 RSS 源
 */
async function fetchRssSource(
  source: IntelligenceSource,
  rsshubBaseUrl?: string
): Promise<{ source: string; items: RawRssItem[]; error?: string }> {
  const startTime = Date.now();

  try {
    // 构建 URL
    const url =
      source.strategy === 'RSSHUB'
        ? `${rsshubBaseUrl || 'https://rsshub.app'}${source.rsshub_path}`
        : source.url;

    console.log(`[api/news/feed] Fetching ${source.name}: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsRefinery/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(10000),  // 10 秒超时
    });

    if (!response.ok) {
      return { source: source.name, items: [], error: `HTTP ${response.status}` };
    }

    const text = await response.text();

    // 验证 RSS 内容
    if (!isValidRssContent(text)) {
      return { source: source.name, items: [], error: 'Invalid RSS content' };
    }

    const items = parseRssXml(text, source.name);

    console.log(
      `[api/news/feed] Fetched ${source.name}: ${items.length} items in ${Date.now() - startTime}ms`
    );

    return { source: source.name, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[api/news/feed] Failed to fetch ${source.name}:`, message);
    return { source: source.name, items: [], error: message };
  }
}

/**
 * 并发抓取所有源
 */
async function fetchAllSources(
  sources: IntelligenceSource[],
  rsshubBaseUrl?: string
): Promise<RawRssItem[]> {
  const results = await Promise.all(
    sources.map(source => fetchRssSource(source, rsshubBaseUrl))
  );

  const allItems: RawRssItem[] = [];
  const errors: Array<{ source: string; error: string }> = [];

  for (const result of results) {
    if (result.error) {
      errors.push({ source: result.source, error: result.error });
    }
    allItems.push(...result.items);
  }

  if (errors.length > 0) {
    console.warn(`[api/news/feed] ${errors.length} sources failed:`, errors);
  }

  return allItems;
}

// ============================================================================
// API Handler
// ============================================================================

interface FeedResponseWithStats extends FeedResponse {
  by_source?: Array<{ source: string; count: number }>;
  ai_enriched?: boolean;
  llm_configured?: boolean;
}

interface ErrorResponse {
  success: false;
  error: string;
  timestamp: string;
}

export async function GET({ locals, url }: {
  locals: App.Locals;
  url: URL;
}) {
  const kv = requireKV(locals);
  const env = locals.runtime?.env as VercelEnv;
  const envVars = getEnv(locals);

  // 解析参数
  const source = url.searchParams.get('source') || undefined;
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const refresh = url.searchParams.get('refresh') === 'true';
  const sinceParam = url.searchParams.get('since');
  const since = sinceParam ? parseInt(sinceParam) : undefined;

  // AI 增强参数
  const summarizeParam = url.searchParams.get('summarize');
  const summarize = summarizeParam === 'true' || summarizeParam === 'cached';
  const summarizeMode = summarizeParam === 'cached' ? 'cached' : (summarizeParam === 'true' ? 'live' : null);
  const category = url.searchParams.get('category') as EnrichedArticle['ai_category'] | null;
  const minSignalParam = url.searchParams.get('minSignal');
  const minSignal = minSignalParam ? parseFloat(minSignalParam) : undefined;

  // 缓存键
  const cacheKey = createCacheKey({ source, limit });

  try {
    // 1. 尝试从缓存获取 (除非强制刷新)
    if (!refresh) {
      // 检查是否是分页请求
      if (page > 1) {
        const paginated = await getPaginatedArticles(kv, {
          page,
          limit,
          source,
          since,
        });

        if (paginated) {
          return Response.json({
            success: true,
            data: paginated.articles,
            stats: {
              total_raw: 0,
              after_dedup: 0,
              after_filter: 0,
              final_count: paginated.articles.length,
              sources: {},
              processing_time_ms: 0,
            },
            cached: true,
            timestamp: new Date().toISOString(),
            hasMore: paginated.hasMore,
          } as FeedResponseWithStats);
        }
      }

      // 完整缓存检查
      const cached = await getCachedFeed(kv, { source, limit });
      if (cached && cached.articles.length > 0) {
        let articles = cached.articles;

        // 按来源筛选
        if (source) {
          articles = articles.filter(a => a.source === source);
        }

        // 按时间筛选
        if (since) {
          articles = articles.filter(a => a.published_at >= since!);
        }

        // 分页
        const start = (page - 1) * limit;
        const end = start + limit;
        const paginatedArticles = articles.slice(start, end);

        // 来源统计
        const bySource = Array.from(
          new Set(articles.map(a => a.source))
        ).map(s => ({
          source: s,
          count: articles.filter(a => a.source === s).length,
        }));

        return Response.json({
          success: true,
          data: paginatedArticles,
          stats: {
            total_raw: 0,
            after_dedup: 0,
            after_filter: 0,
            final_count: articles.length,
            sources: {},
            processing_time_ms: 0,
          },
          cached: true,
          timestamp: new Date().toISOString(),
          hasMore: end < articles.length,
          by_source: bySource,
        } as FeedResponseWithStats);
      }
    }

    // 2. 缓存未命中或强制刷新，执行完整抓取
    console.log('[api/news/feed] Cache miss or refresh requested, fetching...');

    // 获取源配置
    const sources = await getSources(locals);
    console.log(`[api/news/feed] Using ${sources.length} sources`);

    // 抓取所有源
    const rsshubBaseUrl = env?.RSSHUB_BASE_URL?.trim();
    const rawItems = await fetchAllSources(sources, rsshubBaseUrl);

    // 执行 Refinery 流水线
    const { articles, stats } = processRefinery(rawItems);

    console.log(
      `[api/news/feed] Refinery complete: ${stats.final_count}/${stats.total_raw} articles ` +
      `(${stats.processing_time_ms}ms)`
    );

    // AI 增强处理
    let finalArticles: RefinedArticle[] | EnrichedArticle[] = articles;
    let aiEnriched = false;
    let llmConfigured = false;

    if (summarize) {
      const llmBaseUrl = envVars.LLM_BASE_URL as string | undefined;
      const llmApiKey = envVars.LLM_API_KEY as string | undefined;
      const llmModel = envVars.LLM_MODEL as string | undefined;

      llmConfigured = !!(llmBaseUrl && llmApiKey && llmModel);

      if (llmConfigured) {
        // 先按 source/since 筛选
        let articlesToEnrich = articles;
        if (source) {
          articlesToEnrich = articlesToEnrich.filter(a => a.source === source);
        }
        if (since) {
          articlesToEnrich = articlesToEnrich.filter(a => a.published_at >= since!);
        }

        // 只取本页需要的内容
        const start = (page - 1) * limit;
        const end = start + limit;
        const pageArticles = articlesToEnrich.slice(start, end);

        if (summarizeMode === 'cached') {
          // FAST PATH: 仅附加已缓存的 AI 增强结果 (无 LLM 调用)
          console.log('[api/news/feed] Fast path: attaching cached enrichments only');
          const startTime = Date.now();

          const cacheResults = await Promise.allSettled(
            pageArticles.map(article => getCachedEnrichment(kv, article.url))
          );

          const enriched: EnrichedArticle[] = [];
          let cachedCount = 0;

          for (let i = 0; i < cacheResults.length; i++) {
            const result = cacheResults[i];
            const article = pageArticles[i];

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
            } else {
              // 未缓存的文章保持原样
              enriched.push(article as EnrichedArticle);
            }
          }

          console.log(`[api/news/feed] Cached enrichments attached: ${cachedCount}/${pageArticles.length} (${Date.now() - startTime}ms)`);

          // 应用 AI 筛选条件 (只筛选已增强的)
          let filteredResult = enriched;
          if (category || typeof minSignal === 'number') {
            filteredResult = enriched.filter(a => {
              if (!a.ai_enriched) return false;
              if (category && a.ai_category !== category) return false;
              if (typeof minSignal === 'number' && a.ai_signal_score < minSignal) return false;
              return true;
            });
          }

          finalArticles = filteredResult;
          aiEnriched = true;

        } else if (summarizeMode === 'live') {
          // SLOW PATH: 实时 AI 处理 (可能超时，不推荐)
          console.warn('[api/news/feed] Live AI processing enabled (may timeout)');
          const startTime = Date.now();

          const enriched = await enrichArticlesBatch(pageArticles, {
            kv,
            baseUrl: llmBaseUrl,
            apiKey: llmApiKey,
            model: llmModel,
            onProgress: (processed, total) => {
              console.log(`[api/news/feed] AI enrichment: ${processed}/${total}`);
            },
          });

          console.log(`[api/news/feed] Live AI enrichment complete: ${enriched.length}/${pageArticles.length} (${Date.now() - startTime}ms)`);

          // 应用 AI 筛选条件
          let filteredEnriched = enriched;
          if (category) {
            filteredEnriched = filteredEnriched.filter(a => a.ai_category === category);
          }
          if (typeof minSignal === 'number') {
            filteredEnriched = filteredEnriched.filter(a => a.ai_signal_score >= minSignal);
          }

          // 合并为最终结果
          const enrichedMap = new Map(enriched.map(e => [e.url, e]));
          finalArticles = articlesToEnrich.map(a =>
            enrichedMap.get(a.url) as EnrichedArticle || a
          );

          // 如果有 AI 筛选条件，只返回筛选后的结果
          if (category || typeof minSignal === 'number') {
            const filteredUrls = new Set(filteredEnriched.map(e => e.url));
            finalArticles = finalArticles.filter(a => filteredUrls.has(a.url));
          }

          aiEnriched = true;
        }

      } else {
        console.warn('[api/news/feed] AI enrichment requested but LLM not configured');
      }
    }

    // 保存到缓存
    await setCachedFeed(kv, { source, limit }, articles);
    await updateSourceStats(kv, articles);

    // 分页和筛选 (非 AI 模式下)
    let resultArticles = finalArticles;

    if (!aiEnriched) {
      if (source) {
        resultArticles = finalArticles.filter(a => a.source === source);
      }

      if (since) {
        resultArticles = resultArticles.filter(a => a.published_at >= since!);
      }

      const start = (page - 1) * limit;
      const end = start + limit;
      resultArticles = resultArticles.slice(start, end);
    } else {
      // AI 模式下已在之前处理过分页
      const start = (page - 1) * limit;
      const end = start + limit;
      resultArticles = resultArticles.slice(start, end);
    }

    // 来源统计
    const bySource = Object.entries(stats.sources).map(([source, count]) => ({
      source,
      count,
    }));

    const response: FeedResponseWithStats = {
      success: true,
      data: resultArticles,
      stats,
      cached: false,
      timestamp: new Date().toISOString(),
      hasMore: (page * limit) < (aiEnriched ? finalArticles.length : articles.length),
      by_source: bySource,
      ai_enriched: aiEnriched,
      llm_configured: llmConfigured,
    };

    return Response.json(response);

  } catch (error: any) {
    console.error('[api/news/feed] Error:', error);

    const errorResponse: ErrorResponse = {
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    };

    return Response.json(errorResponse, { status: 500 });
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
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
