/**
 * News Module - Source Health Monitoring Types
 *
 * 系统健康监控和源管理类型定义
 */

// ============================================================================
// Health Status Types
// ============================================================================

/**
 * 源健康状态
 */
export type SourceHealthStatus =
  | 'healthy'      // 正常运行，响应及时
  | 'degraded'     // 运行但有问题（高延迟、间歇性失败）
  | 'down'         // 完全不可用
  | 'unknown';     // 尚未检查或检查失败

/**
 * 电路状态 (Circuit Breaker Pattern)
 */
export type CircuitState =
  | 'closed'       // 正常运行，允许请求
  | 'open'         // 熔断打开，拒绝请求（源持续失败）
  | 'half_open';   // 半开状态，允许少量测试请求

/**
 * 源健康记录
 */
export interface SourceHealthRecord {
  source_id: number;
  source_name: string;
  status: SourceHealthStatus;
  circuit_state: CircuitState;

  // 性能指标
  avg_latency_ms: number;
  p95_latency_ms: number;
  last_fetch_time_ms?: number;

  // 可靠性指标
  success_rate: number;        // 0-1, 最近N次请求成功率
  consecutive_failures: number; // 连续失败次数
  consecutive_successes: number; // 连续成功次数

  // 时间戳
  last_check_at: number;       // Unix timestamp
  last_success_at?: number;    // Unix timestamp
  last_failure_at?: number;    // Unix timestamp

  // 错误信息
  last_error?: string;
  error_count_24h: number;

  // 数据质量
  avg_items_per_fetch: number;
  last_item_count: number;

  // 配置
  is_active: boolean;
  category?: string;
}

/**
 * 健康检查配置
 */
export interface HealthCheckConfig {
  // 超时配置
  fetch_timeout_ms: number;

  // 电路熔断阈值
  circuit_failure_threshold: number;  // 连续失败多少次后熔断
  circuit_recovery_threshold: number; // 连续成功多少次后恢复
  circuit_open_duration_ms: number;   // 熔断保持时间

  // 健康状态判定
  degraded_latency_ms: number;        // 超过此延迟视为 degraded
  degraded_success_rate: number;      // 低于此成功率视为 degraded (0-1)

  // 检查间隔
  check_interval_ms: number;
  min_check_interval_ms: number;      // 最小检查间隔

  // 性能统计窗口
  stats_window_size: number;          // 保留最近N次检查结果
}

/**
 * 健康检查结果
 */
export interface HealthCheckResult {
  source_id: number;
  source_name: string;
  success: boolean;
  latency_ms: number;
  items_count: number;
  error?: string;
  checked_at: number;
}

/**
 * 系统健康摘要
 */
export interface SystemHealthSummary {
  overall_status: 'healthy' | 'degraded' | 'down';
  total_sources: number;
  healthy_sources: number;
  degraded_sources: number;
  down_sources: number;

  // 分类统计
  by_category: Record<string, {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
  }>;

  // 最近更新
  last_check_at: number;
  next_check_at?: number;

  // 各源详细状态
  sources: SourceHealthRecord[];
}

/**
 * 源配置 (用于 sources.json)
 */
export interface SourceConfig {
  id: number;
  name: string;
  url?: string;
  strategy: 'DIRECT' | 'RSSHUB';
  rsshub_path?: string;
  category: string;
  weight: number;
  is_active: boolean;

  // 健康配置覆盖
  health_override?: Partial<HealthCheckConfig>;
}

/**
 * 源配置文件结构
 */
export interface SourcesConfigFile {
  version: string;           // 配置版本
  last_updated: string;      // ISO 8601
  config: HealthCheckConfig; // 全局健康检查配置
  sources: SourceConfig[];   // 源列表
}

// ============================================================================
// Story Clustering (Deduplication) Types
// ============================================================================

/**
 * 故事集群 - 多个源报道的同一事件
 */
export interface StoryCluster {
  cluster_id: string;        // 集群唯一标识
  primary_article: {
    id: string;
    title: string;
    url: string;
    source: string;
    published_at: number;
  };
  related_articles: Array<{
    id: string;
    title: string;
    url: string;
    source: string;
    published_at: number;
  }>;
  source_count: number;      // 报道此事件的源数量

  // AI 生成的统一摘要
  unified_summary?: string;
  key_entities?: string[];   // 涉及的关键实体

  // 信号评分
  signal_score: number;      // 基于所有文章的综合评分
  created_at: number;
}

/**
 * 去重配置
 */
export interface DeduplicationConfig {
  enabled: boolean;
  min_similarity: number;    // 0-1, 相似度阈值
  clustering_algorithm: 'simple' | 'embedding' | 'hybrid';

  // AI 增强配置
  ai_enabled: boolean;
  ai_cluster_summary: boolean; // 是否生成统一摘要

  // 时间窗口 (小时)
  time_window_hours: number;   // 超过此时间差的文章不聚类
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * 默认健康检查配置
 */
export const DEFAULT_HEALTH_CONFIG: HealthCheckConfig = {
  fetch_timeout_ms: 10000,           // 10 秒
  circuit_failure_threshold: 3,      // 连续失败 3 次后熔断
  circuit_recovery_threshold: 2,     // 连续成功 2 次后恢复
  circuit_open_duration_ms: 5 * 60 * 1000,  // 熔断保持 5 分钟
  degraded_latency_ms: 3000,         // 超过 3 秒视为 degraded
  degraded_success_rate: 0.8,        // 成功率低于 80% 视为 degraded
  check_interval_ms: 60 * 1000,      // 每分钟检查一次
  min_check_interval_ms: 30 * 1000,  // 最小 30 秒间隔
  stats_window_size: 20,             // 保留最近 20 次检查
};

/**
 * 默认去重配置
 */
export const DEFAULT_DEDUP_CONFIG: DeduplicationConfig = {
  enabled: true,
  min_similarity: 0.75,
  clustering_algorithm: 'hybrid',
  ai_enabled: true,
  ai_cluster_summary: true,
  time_window_hours: 48,
};

/**
 * 默认源配置
 */
export const DEFAULT_SOURCES_CONFIG: SourcesConfigFile = {
  version: '1.0.0',
  last_updated: new Date().toISOString(),
  config: DEFAULT_HEALTH_CONFIG,
  sources: [
    {
      id: 1,
      name: 'Hacker News',
      url: 'https://news.ycombinator.com/rss',
      strategy: 'DIRECT',
      category: 'tech',
      weight: 1.0,
      is_active: true,
    },
    {
      id: 2,
      name: 'V2EX',
      url: 'https://www.v2ex.com/index.xml',
      strategy: 'DIRECT',
      category: 'tech',
      weight: 1.0,
      is_active: true,
    },
    {
      id: 3,
      name: '36氪',
      strategy: 'RSSHUB',
      rsshub_path: '/36kr',
      category: 'tech',
      weight: 1.0,
      is_active: true,
    },
    {
      id: 4,
      name: '少数派',
      strategy: 'RSSHUB',
      rsshub_path: '/sspai',
      category: 'tech',
      weight: 1.0,
      is_active: true,
    },
    {
      id: 5,
      name: 'TechCrunch',
      url: 'https://techcrunch.com/feed/',
      strategy: 'DIRECT',
      category: 'tech',
      weight: 0.8,
      is_active: true,
    },
    {
      id: 6,
      name: 'The Verge',
      url: 'https://www.theverge.com/rss/index.xml',
      strategy: 'DIRECT',
      category: 'tech',
      weight: 0.8,
      is_active: true,
    },
    {
      id: 7,
      name: 'Ars Technica',
      url: 'https://feeds.arstechnica.com/arstechnica/index',
      strategy: 'DIRECT',
      category: 'tech',
      weight: 0.7,
      is_active: true,
    },
    {
      id: 8,
      name: 'Product Hunt',
      strategy: 'RSSHUB',
      rsshub_path: '/producthunt',
      category: 'product',
      weight: 0.6,
      is_active: true,
    },
    {
      id: 9,
      name: 'Indie Hackers',
      url: 'https://www.indiehackers.com/latest.rss',
      strategy: 'DIRECT',
      category: 'business',
      weight: 0.7,
      is_active: true,
    },
    {
      id: 10,
      name: 'MIT Technology Review',
      url: 'https://www.technologyreview.com/feed/',
      strategy: 'DIRECT',
      category: 'science',
      weight: 0.8,
      is_active: true,
    },
  ],
};
