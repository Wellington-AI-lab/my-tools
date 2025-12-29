/**
 * Intelligence Scan API
 *
 * 新闻聚合抓取接口，支持 DIRECT 和 RSSHUB 两种数据源策略
 *
 * Query Parameters:
 * - category: (optional) 按分类抓取 (如 'tech', 'finance')
 * - strategy: (optional) 按策略抓取 ('DIRECT' | 'RSSHUB')
 * - limit: (optional) 限制返回文章数量，默认 100
 * - update_reliability: (optional) 是否更新可靠性评分，默认 true
 */

import { requireIntelligenceDB, getEnv } from '@/lib/env';
import { getActiveSources, getSourcesByCategory, getSourcesByStrategy } from '@/modules/intelligence/repository';
import { fetchMultipleSources, updateSourceStatuses } from '@/modules/intelligence/fetcher';
import type { IntelligenceArticle } from '@/modules/intelligence/types';

// 响应类型
interface ScanResponse {
  success: boolean;
  scan_id: string;
  timestamp: string;
  sources_scanned: number;
  sources_succeeded: number;
  sources_failed: number;
  total_articles: number;
  articles: IntelligenceArticle[];
  errors: Array<{ source_id: number; error: string }>;
  reliability_updates?: Array<{
    source_id: number;
    old_score: number;
    new_score: number;
  }>;
}

interface ErrorResponse {
  success: false;
  error: string;
  scan_id?: string;
  timestamp: string;
}

// 生成扫描 ID
function generateScanId(): string {
  return `intel_scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 整合文章列表并去重（基于 URL）
function deduplicateArticles(articles: IntelligenceArticle[]): IntelligenceArticle[] {
  const seen = new Set<string>();
  const deduped: IntelligenceArticle[] = [];

  for (const article of articles) {
    if (!seen.has(article.url)) {
      seen.add(article.url);
      deduped.push(article);
    }
  }

  // 按发布时间排序（最新的在前）
  return deduped.sort((a, b) => b.published_at - a.published_at);
}

/**
 * GET handler
 */
export async function GET({ locals, url }: {
  locals: App.Locals;
  url: URL;
}) {
  const db = requireIntelligenceDB(locals);
  const env = getEnv(locals) as CloudflareEnv;
  const scanId = generateScanId();
  const startTime = Date.now();

  // 解析参数
  const category = url.searchParams.get('category');
  const strategyParam = url.searchParams.get('strategy') as 'DIRECT' | 'RSSHUB' | null;
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const updateReliability = url.searchParams.get('update_reliability') !== 'false';

  try {
    // 获取要抓取的数据源
    let sources;
    if (category) {
      sources = await getSourcesByCategory(db, category);
    } else if (strategyParam) {
      sources = await getSourcesByStrategy(db, strategyParam);
    } else {
      sources = await getActiveSources(db);
    }

    if (sources.length === 0) {
      return Response.json({
        success: false,
        error: category
          ? `No active sources found for category: ${category}`
          : strategyParam
          ? `No active sources found for strategy: ${strategyParam}`
          : 'No active sources found',
        scan_id: scanId,
        timestamp: new Date().toISOString(),
      } as ErrorResponse, { status: 404 });
    }

    console.log(`[intelligence/scan] Starting scan ${scanId} with ${sources.length} sources`);

    // 获取 RSSHUB_BASE_URL 环境变量
    const rsshubBaseUrl = env.RSSHUB_BASE_URL?.trim() || undefined;
    if (rsshubBaseUrl) {
      console.log(`[intelligence/scan] Using custom RSSHub: ${rsshubBaseUrl}`);
    }

    // 并发抓取所有数据源
    const fetchResults = await fetchMultipleSources(sources, {
      rsshubBaseUrl,
      timeoutMs: 10000,
      maxRetries: 2,
      concurrency: 5,
    });

    // 提取文章和错误信息
    const allArticles: IntelligenceArticle[] = [];
    const errors: Array<{ source_id: number; error: string }> = [];
    let successCount = 0;

    for (const result of fetchResults) {
      if (result.success) {
        successCount++;
        if ((result as any).articles) {
          allArticles.push(...(result as any).articles);
        }
      } else if (result.error) {
        errors.push({
          source_id: result.source_id,
          error: result.error,
        });
      }
    }

    // 去重并排序
    const uniqueArticles = deduplicateArticles(allArticles);
    const limitedArticles = uniqueArticles.slice(0, limit);

    // 更新可靠性评分（异步，不阻塞响应）
    let reliabilityUpdates: Array<{ source_id: number; old_score: number; new_score: number }> = [];

    if (updateReliability) {
      const updateResults = await updateSourceStatuses(db, fetchResults);
      reliabilityUpdates = updateResults
        .filter(r => r.success && r.reliabilityChanged)
        .map(r => ({
          source_id: r.sourceId,
          old_score: r.oldScore!,
          new_score: r.newScore!,
        }));
    }

    const duration = Date.now() - startTime;

    console.log(
      `[intelligence/scan] Scan ${scanId} completed: ${successCount}/${sources.length} sources, ` +
      `${limitedArticles.length} articles, ${duration}ms`
    );

    // 返回结果
    const response: ScanResponse = {
      success: true,
      scan_id: scanId,
      timestamp: new Date().toISOString(),
      sources_scanned: sources.length,
      sources_succeeded: successCount,
      sources_failed: sources.length - successCount,
      total_articles: limitedArticles.length,
      articles: limitedArticles,
      errors,
      ...(reliabilityUpdates.length > 0 && { reliability_updates: reliabilityUpdates }),
    };

    return Response.json(response);

  } catch (error: any) {
    console.error(`[intelligence/scan] Scan ${scanId} failed:`, error);

    return Response.json({
      success: false,
      error: error.message || 'Unknown error',
      scan_id: scanId,
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 500 });
  }
}
