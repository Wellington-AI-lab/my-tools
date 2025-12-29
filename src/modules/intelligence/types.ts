/**
 * 数据源抓取策略
 */
export type SourceStrategy = 'DIRECT' | 'RSSHUB';

/**
 * 数据源状态
 */
export type SourceStatus = 'active' | 'inactive' | 'error';

/**
 * 情报源配置实体
 */
export interface IntelligenceSource {
  id: number;
  name: string;                    // 源名称
  url: string;                     // 原始地址
  strategy: SourceStrategy;        // 抓取策略
  rsshub_path?: string | null;     // RSSHub 路径
  category?: string | null;        // 分类
  weight: number;                  // 权重 (默认 1.0)
  logic_filter?: string | null;    // AI 过滤指令
  is_active: number;               // 0 或 1
  last_scraped_at?: string | null; // ISO 8601
  reliability_score: number;       // 可靠性评分 (0-1)
  created_at?: string;             // ISO 8601
  updated_at?: string;             // ISO 8601
}

/**
 * 创建数据源的输入 DTO
 */
export interface CreateSourceInput {
  name: string;
  url: string;
  strategy: SourceStrategy;
  rsshub_path?: string;
  category?: string;
  weight?: number;
  logic_filter?: string;
  is_active?: number;
}

/**
 * 更新数据源的输入 DTO
 */
export interface UpdateSourceInput {
  name?: string;
  url?: string;
  strategy?: SourceStrategy;
  rsshub_path?: string;
  category?: string;
  weight?: number;
  logic_filter?: string;
  is_active?: number;
  reliability_score?: number;
}

/**
 * 数据源运行时状态（包含动态计算字段）
 */
export interface SourceRuntimeInfo extends IntelligenceSource {
  status: SourceStatus;
  last_error?: string;
  consecutive_failures: number;
  avg_fetch_time_ms: number;
}

/**
 * 数据源抓取结果
 */
export interface SourceFetchResult {
  source_id: number;
  success: boolean;
  items_count: number;
  error?: string;
  fetch_time_ms: number;
}

/**
 * 情报文章实体（用于聚合后的新闻项）
 */
export interface IntelligenceArticle {
  id: string;                      // 唯一标识 (通常是 URL hash)
  source_id: number;               // 关联的数据源 ID
  url: string;                     // 文章链接
  title: string;                   // 标题
  summary?: string;                // AI 生成的摘要
  content?: string;                // 原始内容
  author?: string;                 // 作者
  published_at: number;            // Unix 时间戳
  scraped_at: number;              // 抓取时间戳
  tags?: string[];                 // AI 提取的标签
  embedding?: number[];            // 向量嵌入（用于相似度搜索）
}

/**
 * 抓取统计信息
 */
export interface ScrapeStats {
  total_sources: number;
  active_sources: number;
  total_articles: number;
  last_scrape_at: string;
  by_source: Array<{
    source_id: number;
    source_name: string;
    articles_count: number;
    last_scraped_at: string;
  }>;
}
