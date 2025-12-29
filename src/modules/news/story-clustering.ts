/**
 * News Module - Story Clustering & Deduplication
 *
 * 使用 AI 对多篇来源报道同一事件的文章进行聚类和去重
 *
 * 策略:
 * 1. Simple: 基于标题相似度 (Levenshtein distance)
 * 2. Embedding: 基于语义相似度 (需要 embedding API)
 * 3. Hybrid: 结合标题相似度和时间窗口
 */

import type { RefinedArticle } from './types';
import type {
  StoryCluster,
  DeduplicationConfig,
  SourceConfig,
} from './health-types';
import { DEFAULT_DEDUP_CONFIG } from './health-types';
import { similarity } from './refinery';
import type { KVStorage } from '@/lib/storage/kv';

// ============================================================================
// KV Storage Keys
// ============================================================================

const CLUSTER_KEYS = {
  CLUSTER_CACHE: 'news:clusters',
  CLUSTER_BY_URL: (url: string) => `news:cluster:url:${encodeURIComponent(url)}`,
  CLUSTER_META: 'news:clusters:meta',
} as const;

// ============================================================================
// Simple Clustering (Title Similarity)
// ============================================================================

/**
 * 基于标题相似度进行简单聚类
 */
export function clusterBySimilarity(
  articles: RefinedArticle[],
  config: DeduplicationConfig = DEFAULT_DEDUP_CONFIG
): StoryCluster[] {
  const clusters: StoryCluster[] = [];
  const used = new Set<string>();

  // 按发布时间排序（最新的优先）
  const sorted = [...articles].sort((a, b) => b.published_at - a.published_at);

  for (const article of sorted) {
    if (used.has(article.url)) continue;

    // 查找相似文章
    const related: RefinedArticle[] = [];
    const timeWindow = config.time_window_hours * 3600;

    for (const other of sorted) {
      if (other.url === article.url) continue;
      if (used.has(other.url)) continue;

      // 检查时间窗口
      const timeDiff = Math.abs(article.published_at - other.published_at);
      if (timeDiff > timeWindow) continue;

      // 检查标题相似度
      const sim = similarity(article.title, other.title);
      if (sim >= config.min_similarity) {
        related.push(other);
      }
    }

    // 标记为已使用
    used.add(article.url);

    // 计算综合信号评分
    let signalScore = article.signal_score;
    if (related.length > 0) {
      const avgSignal = related.reduce((sum, r) => sum + r.signal_score, 0) / related.length;
      signalScore = Math.max(article.signal_score, avgSignal);
    }

    const cluster: StoryCluster = {
      cluster_id: generateClusterId(article.url),
      primary_article: {
        id: article.id,
        title: article.title,
        url: article.url,
        source: article.source,
        published_at: article.published_at,
      },
      related_articles: related.map(r => ({
        id: r.id,
        title: r.title,
        url: r.url,
        source: r.source,
        published_at: r.published_at,
      })),
      source_count: 1 + related.length,
      signal_score: Math.round(signalScore * 1000) / 1000,
      created_at: Math.floor(Date.now() / 1000),
    };

    clusters.push(cluster);

    // 标记相关文章为已使用
    for (const r of related) {
      used.add(r.url);
    }
  }

  // 按信号评分和源数量排序
  clusters.sort((a, b) => {
    if (b.source_count !== a.source_count) {
      return b.source_count - a.source_count;  // 源多的优先
    }
    return b.signal_score - a.signal_score;    // 信号高的优先
  });

  return clusters;
}

// ============================================================================
// AI-Enhanced Clustering
// ============================================================================

/**
 * AI 聚类请求
 */
interface AIClusterRequest {
  articles: Array<{
    title: string;
    url: string;
    source: string;
    summary: string;
  }>;
  min_similarity: number;
  time_window_hours: number;
}

/**
 * AI 聚类响应
 */
interface AIClusterResponse {
  clusters: Array<{
    cluster_id: string;
    article_urls: string[];
    unified_summary?: string;
    key_entities?: string[];
  }>;
}

/**
 * 使用 AI 进行智能聚类
 */
export async function clusterWithAI(
  articles: RefinedArticle[],
  kv: KVStorage,
  aiConfig: {
    baseUrl: string;
    apiKey: string;
    model: string;
  },
  config: DeduplicationConfig = DEFAULT_DEDUP_CONFIG
): Promise<StoryCluster[]> {
  // 检查缓存
  const cacheKey = buildClusterCacheKey(articles, config);
  const cached = await getClusteredCache(kv, cacheKey);
  if (cached) {
    return cached;
  }

  // 准备请求数据
  const request: AIClusterRequest = {
    articles: articles.map(a => ({
      title: a.title,
      url: a.url,
      source: a.source,
      summary: a.summary,
    })),
    min_similarity: config.min_similarity,
    time_window_hours: config.time_window_hours,
  };

  try {
    const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`,
      },
      signal: AbortSignal.timeout(30000),  // 30 秒超时
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          {
            role: 'system',
            content: `You are a news clustering expert. Group articles that report the same event/story.

Rules:
- Group articles with similar titles and topics
- Consider the time window (articles too far apart are likely different events)
- Extract key entities (people, companies, products mentioned)
- Generate a unified summary for each cluster

Return JSON format:
{
  "clusters": [
    {
      "cluster_id": "unique_id",
      "article_urls": ["url1", "url2", ...],
      "unified_summary": "One-sentence summary of the event",
      "key_entities": ["entity1", "entity2", ...]
    }
  ]
}`,
          },
          {
            role: 'user',
            content: `Cluster these articles:\n${JSON.stringify(request, null, 2)}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResult = JSON.parse(data.choices[0].message.content) as AIClusterResponse;

    // 转换为 StoryCluster 格式
    const clusters: StoryCluster[] = [];
    const articleMap = new Map(articles.map(a => [a.url, a]));

    for (const aiCluster of aiResult.clusters) {
      const articlesInCluster = aiCluster.article_urls
        .map(url => articleMap.get(url))
        .filter((a): a is RefinedArticle => a !== undefined);

      if (articlesInCluster.length === 0) continue;

      // 选择主要文章（最新且信号最高）
      const primary = articlesInCluster
        .sort((a, b) => {
          if (b.signal_score !== a.signal_score) {
            return b.signal_score - a.signal_score;
          }
          return b.published_at - a.published_at;
        })[0];

      const related = articlesInCluster.filter(a => a.url !== primary.url);

      // 计算综合信号评分
      const signalScore = articlesInCluster.reduce(
        (sum, a) => sum + a.signal_score,
        0
      ) / articlesInCluster.length;

      clusters.push({
        cluster_id: aiCluster.cluster_id,
        primary_article: {
          id: primary.id,
          title: primary.title,
          url: primary.url,
          source: primary.source,
          published_at: primary.published_at,
        },
        related_articles: related.map(a => ({
          id: a.id,
          title: a.title,
          url: a.url,
          source: a.source,
          published_at: a.published_at,
        })),
        source_count: articlesInCluster.length,
        unified_summary: aiCluster.unified_summary,
        key_entities: aiCluster.key_entities,
        signal_score: Math.round(signalScore * 1000) / 1000,
        created_at: Math.floor(Date.now() / 1000),
      });
    }

    // 添加未被聚类的文章
    const clusteredUrls = new Set(aiResult.clusters.flatMap(c => c.article_urls));
    for (const article of articles) {
      if (clusteredUrls.has(article.url)) continue;

      clusters.push({
        cluster_id: generateClusterId(article.url),
        primary_article: {
          id: article.id,
          title: article.title,
          url: article.url,
          source: article.source,
          published_at: article.published_at,
        },
        related_articles: [],
        source_count: 1,
        signal_score: article.signal_score,
        created_at: Math.floor(Date.now() / 1000),
      });
    }

    // 排序
    clusters.sort((a, b) => {
      if (b.source_count !== a.source_count) {
        return b.source_count - a.source_count;
      }
      return b.signal_score - a.signal_score;
    });

    // 缓存结果
    await saveClusteredCache(kv, cacheKey, clusters);

    return clusters;
  } catch (error) {
    console.error('[story-clustering] AI clustering failed, falling back to simple:', error);
    // 回退到简单聚类
    return clusterBySimilarity(articles, config);
  }
}

/**
 * 混合聚类策略
 * 先用简单方法聚类，然后用 AI 增强重要集群
 */
export async function clusterHybrid(
  articles: RefinedArticle[],
  kv: KVStorage,
  aiConfig?: {
    baseUrl: string;
    apiKey: string;
    model: string;
  },
  config: DeduplicationConfig = DEFAULT_DEDUP_CONFIG
): Promise<StoryCluster[]> {
  // 检查缓存
  const cacheKey = buildClusterCacheKey(articles, config);
  const cached = await getClusteredCache(kv, cacheKey);
  if (cached) {
    return cached;
  }

  // 先用简单方法聚类
  let clusters = clusterBySimilarity(articles, config);

  // 如果有 AI 配置，对重要集群进行增强
  if (aiConfig && config.ai_cluster_summary) {
    // 只对多源报道的集群进行 AI 增强
    const importantClusters = clusters.filter(c => c.source_count >= 2);

    if (importantClusters.length > 0) {
      // 这里可以调用 AI 生成统一摘要
      // 暂时跳过，避免过多的 API 调用
    }
  }

  // 缓存结果
  await saveClusteredCache(kv, cacheKey, clusters);

  return clusters;
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * 生成聚类缓存键
 */
function buildClusterCacheKey(
  articles: RefinedArticle[],
  config: DeduplicationConfig
): string {
  // 使用文章 URL 列表的哈希作为缓存键
  const urls = articles.map(a => a.url).sort().join('|');
  let hash = 0;
  for (let i = 0; i < urls.length; i++) {
    const char = urls.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `news:clusters:${Math.abs(hash).toString(36)}:${config.min_similarity}`;
}

/**
 * 获取聚类缓存
 */
export async function getClusteredCache(
  kv: KVStorage,
  cacheKey: string
): Promise<StoryCluster[] | null> {
  try {
    const result = await kv.get(cacheKey, { type: 'text' });
    if (typeof result !== 'string') return null;

    const data = JSON.parse(result);
    const meta = await kv.get(`${cacheKey}:meta`, { type: 'text' });

    if (meta) {
      const metaData = JSON.parse(meta);
      const now = Date.now();
      if (now > metaData.expires_at) {
        return null;  // 缓存过期
      }
    }

    return data as StoryCluster[];
  } catch (error) {
    console.error('[story-clustering] Failed to get clustered cache:', error);
    return null;
  }
}

/**
 * 保存聚类缓存
 */
async function saveClusteredCache(
  kv: KVStorage,
  cacheKey: string,
  clusters: StoryCluster[],
  ttlSeconds: number = 1800  // 30 minutes
): Promise<void> {
  try {
    await Promise.all([
      kv.put(cacheKey, JSON.stringify(clusters), {
        expirationTtl: ttlSeconds,
      }),
      kv.put(`${cacheKey}:meta`, JSON.stringify({
        created_at: Date.now(),
        expires_at: Date.now() + ttlSeconds * 1000,
        cluster_count: clusters.length,
      }), {
        expirationTtl: ttlSeconds,
      }),
    ]);
  } catch (error) {
    console.error('[story-clustering] Failed to save clustered cache:', error);
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * 生成集群 ID
 */
function generateClusterId(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `cluster_${Math.abs(hash).toString(36)}`;
}

/**
 * 将文章列表按聚类去重
 * 返回去重后的文章列表（每个集群只保留最重要的文章）
 */
export function deduplicateByClusters(
  articles: RefinedArticle[],
  clusters: StoryCluster[]
): RefinedArticle[] {
  const deduplicated: RefinedArticle[] = [];

  for (const cluster of clusters) {
    // 只添加主要文章
    const primary = articles.find(a => a.url === cluster.primary_article.url);
    if (primary) {
      deduplicated.push(primary);
    }
  }

  return deduplicated;
}

/**
 * 获取聚类统计信息
 */
export interface ClusteringStats {
  total_articles: number;
  total_clusters: number;
  duplicate_removed: number;
  multi_source_clusters: number;
  avg_cluster_size: number;
}

export function getClusteringStats(
  articles: RefinedArticle[],
  clusters: StoryCluster[]
): ClusteringStats {
  const multiSourceClusters = clusters.filter(c => c.source_count >= 2);
  const totalClustered = clusters.reduce((sum, c) => sum + c.source_count, 0);

  return {
    total_articles: articles.length,
    total_clusters: clusters.length,
    duplicate_removed: articles.length - clusters.length,
    multi_source_clusters: multiSourceClusters.length,
    avg_cluster_size: clusters.length > 0
      ? Math.round((totalClustered / clusters.length) * 10) / 10
      : 0,
  };
}
