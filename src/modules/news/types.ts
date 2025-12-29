/**
 * News Module - Refinery Pattern Types
 *
 * 实现高信噪比的 RSS 处理流水线
 */

/**
 * 原始 RSS 项（未处理）
 */
export interface RawRssItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  author?: string;
  content?: string;
  source: string;
}

/**
 * 精炼后的文章（经过清洗和过滤）
 */
export interface RefinedArticle {
  id: string;
  url: string;
  title: string;
  summary: string;
  source: string;
  author?: string;
  published_at: number;  // Unix timestamp (seconds)
  refined_at: number;
  signal_score: number;  // 0-1, 内容质量评分
  tags?: string[];
  language: 'zh' | 'en' | 'other';
}

/**
 * 信号过滤规则
 */
export interface SignalFilter {
  minTitleLength: number;
  maxTitleLength: number;
  minContentLength: number;
  blockedKeywords: string[];
  requiredKeywords?: string[];
  lowQualityPatterns: RegExp[];
  duplicateThreshold: number;  // 相似度阈值 0-1
}

/**
 * 精炼统计
 */
export interface RefineryStats {
  total_raw: number;
  after_dedup: number;
  after_filter: number;
  final_count: number;
  sources: Record<string, number>;
  processing_time_ms: number;
}

/**
 * Feed 响应类型
 */
export interface FeedResponse {
  success: boolean;
  data: RefinedArticle[];
  stats: RefineryStats;
  cached: boolean;
  timestamp: string;
  hasMore: boolean;
}

/**
 * 缓存元数据
 */
export interface CacheMetadata {
  count: number;
  created_at: number;
  expires_at: number;
  sources: string[];
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number;
  limit: number;
  source?: string;
  since?: number;  // Unix timestamp
}

/**
 * AI 增强分类
 */
export type ArticleCategory =
  | 'engineering'     // 技术实现、架构、工程
  | 'ai'              // AI/ML 相关
  | 'business'        // 商业、融资、市场
  | 'product'         // 产品发布、更新
  | 'science'         // 科学研究
  | 'opinion'         // 观点、评论
  | 'noise';          // 低价值内容

/**
 * AI 增强结果
 */
export interface AIEnrichment {
  category: ArticleCategory;
  bottom_line: string;      // 一句话总结
  signal_score: number;     // 0-10 信号评分 (基于创新度/影响力)
  key_insights?: string[];  // 关键洞察 (可选)
  processing_tokens?: number;
}

/**
 * AI 增强后的文章
 */
export type EnrichedArticle = RefinedArticle & {
  ai_enriched: true;
  ai_category: ArticleCategory;
  ai_bottom_line: string;
  ai_signal_score: number;  // 0-10
  ai_key_insights?: string[];
};
