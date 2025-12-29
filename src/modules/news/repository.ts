/**
 * News Repository - KV 缓存存储层
 *
 * 使用 Vercel KV 缓存精炼后的新闻流
 * 实现智能缓存失效和 TTL 管理
 */

import type { RefinedArticle, CacheMetadata, PaginationParams } from './types';
import type { KVStorage } from '@/lib/storage/kv';

// ============================================================================
// KV 存储键前缀
// ============================================================================

const KEYS = {
  FEED_CACHE: 'news:feed',
  FEED_METADATA: 'news:meta',
  ARTICLE_BY_ID: (id: string) => `news:article:${id}`,
  SOURCE_STATS: 'news:stats:source',
  TOTAL_COUNT: 'news:count:total',
} as const;

// ============================================================================
// KV 操作封装
// ============================================================================

/**
 * 获取缓存的 Feed 数据
 */
export async function getCachedFeed(
  kv: KVStorage,
  params: { source?: string; limit?: number }
): Promise<{ articles: RefinedArticle[]; meta: CacheMetadata } | null> {
  const cacheKey = params.source
    ? `${KEYS.FEED_CACHE}:${params.source}`
    : KEYS.FEED_CACHE;

  try {
    const [articlesResult, metaResult] = await Promise.all([
      kv.get(cacheKey, { type: 'text' }),
      kv.get(`${cacheKey}:meta`, { type: 'text' }),
    ]);

    const articlesStr = typeof articlesResult === 'string' ? articlesResult : null;
    const metaStr = typeof metaResult === 'string' ? metaResult : null;

    if (!articlesStr || !metaStr) {
      return null;
    }

    const articles: RefinedArticle[] = JSON.parse(articlesStr);
    const meta: CacheMetadata = JSON.parse(metaStr);

    // 检查是否过期
    if (Date.now() > meta.expires_at) {
      return null;
    }

    return { articles, meta };
  } catch (error) {
    console.error('[news/repository] Failed to get cached feed:', error);
    return null;
  }
}

/**
 * 保存 Feed 数据到 KV 缓存
 */
export async function setCachedFeed(
  kv: KVStorage,
  params: { source?: string; limit?: number },
  articles: RefinedArticle[],
  ttlMs: number = 5 * 60 * 1000  // 默认 5 分钟
): Promise<void> {
  const cacheKey = params.source
    ? `${KEYS.FEED_CACHE}:${params.source}`
    : KEYS.FEED_CACHE;

  const now = Date.now();
  const sources = Array.from(new Set(articles.map(a => a.source)));

  const meta: CacheMetadata = {
    count: articles.length,
    created_at: now,
    expires_at: now + ttlMs,
    sources,
  };

  try {
    await Promise.all([
      kv.put(cacheKey, JSON.stringify(articles), {
        expirationTtl: Math.floor(ttlMs / 1000),
      }),
      kv.put(`${cacheKey}:meta`, JSON.stringify(meta), {
        expirationTtl: Math.floor(ttlMs / 1000),
      }),
    ]);

    // 更新总数统计
    await kv.put(KEYS.TOTAL_COUNT, String(articles.length));
  } catch (error) {
    console.error('[news/repository] Failed to set cached feed:', error);
  }
}

/**
 * 获取来源统计
 */
export async function getSourceStats(
  kv: KVStorage
): Promise<Record<string, number>> {
  try {
    const statsResult = await kv.get(KEYS.SOURCE_STATS, { type: 'text' });
    const statsStr = typeof statsResult === 'string' ? statsResult : null;
    return statsStr ? JSON.parse(statsStr) : {};
  } catch (error) {
    console.error('[news/repository] Failed to get source stats:', error);
    return {};
  }
}

/**
 * 更新来源统计
 */
export async function updateSourceStats(
  kv: KVStorage,
  articles: RefinedArticle[]
): Promise<void> {
  const stats: Record<string, number> = {};

  for (const article of articles) {
    stats[article.source] = (stats[article.source] || 0) + 1;
  }

  try {
    await kv.put(KEYS.SOURCE_STATS, JSON.stringify(stats), {
      expirationTtl: 3600,  // 1 小时
    });
  } catch (error) {
    console.error('[news/repository] Failed to update source stats:', error);
  }
}

/**
 * 清除缓存
 */
export async function clearCache(
  kv: KVStorage,
  params?: { source?: string }
): Promise<void> {
  const cacheKey = params?.source
    ? `${KEYS.FEED_CACHE}:${params.source}`
    : KEYS.FEED_CACHE;

  try {
    await Promise.all([
      kv.delete(cacheKey),
      kv.delete(`${cacheKey}:meta`),
    ]);
  } catch (error) {
    console.error('[news/repository] Failed to clear cache:', error);
  }
}

/**
 * 检查缓存是否存在且有效
 */
export async function isCacheValid(
  kv: KVStorage,
  params?: { source?: string }
): Promise<boolean> {
  const cacheKey = params?.source
    ? `${KEYS.FEED_CACHE}:${params.source}`
    : KEYS.FEED_CACHE;

  try {
    const metaResult = await kv.get(`${cacheKey}:meta`, { type: 'text' });
    const metaStr = typeof metaResult === 'string' ? metaResult : null;
    if (!metaStr) return false;

    const meta: CacheMetadata = JSON.parse(metaStr);
    return Date.now() <= meta.expires_at;
  } catch (error) {
    return false;
  }
}

/**
 * 获取缓存 TTL (剩余秒数)
 */
export async function getCacheTTL(
  kv: KVStorage,
  params?: { source?: string }
): Promise<number | null> {
  const cacheKey = params?.source
    ? `${KEYS.FEED_CACHE}:${params.source}`
    : KEYS.FEED_CACHE;

  try {
    const metaResult = await kv.get(`${cacheKey}:meta`, { type: 'text' });
    const metaStr = typeof metaResult === 'string' ? metaResult : null;
    if (!metaStr) return null;

    const meta: CacheMetadata = JSON.parse(metaStr);
    const remainingMs = meta.expires_at - Date.now();
    return Math.max(0, Math.floor(remainingMs / 1000));
  } catch (error) {
    return null;
  }
}

/**
 * 分页获取文章 (从缓存)
 */
export async function getPaginatedArticles(
  kv: KVStorage,
  params: PaginationParams
): Promise<{ articles: RefinedArticle[]; hasMore: boolean } | null> {
  const cached = await getCachedFeed(kv, { source: params.source });
  if (!cached) return null;

  let articles = cached.articles;

  // 按来源筛选
  if (params.source) {
    articles = articles.filter(a => a.source === params.source);
  }

  // 按时间筛选
  if (params.since) {
    articles = articles.filter(a => a.published_at >= params.since!);
  }

  // 分页
  const start = (params.page - 1) * params.limit;
  const end = start + params.limit;
  const paginated = articles.slice(start, end);

  return {
    articles: paginated,
    hasMore: end < articles.length,
  };
}
