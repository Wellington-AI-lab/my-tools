/**
 * 信息流模块类型定义
 */

// 支持的主题
export type NewsTheme = 'finance' | 'economy' | 'ai';

// 数据源标识
export type NewsSourceId =
  | 'wallstreetcn'
  | 'jin10'
  | 'xueqiu'
  | 'thepaper'
  | 'ftchinese'
  | '36kr'
  | 'hackernews'
  | 'sspai';

// 单条新闻
export type NewsItem = {
  id: string;
  source: NewsSourceId;
  title: string;
  summary?: string;
  url: string;
  publishedAt?: string; // ISO 8601
  author?: string;
  imageUrl?: string;
  extra?: Record<string, unknown>;
};

// 数据源抓取结果
export type SourceFetchResult = {
  source: NewsSourceId;
  items: NewsItem[];
  fetchedAt: string; // ISO 8601
  error?: string;
};

// 语义匹配后的新闻（带相关性信息）
export type MatchedNewsItem = NewsItem & {
  theme: NewsTheme;
  matchedKeywords: string[];
  relevanceScore: number; // 0-1
};

// 信息流报告
export type NewsReport = {
  meta: {
    generated_at: string;
    day_key: string;
    keywords_used: Record<NewsTheme, string[]>;
    sources_status: Record<NewsSourceId, { ok: boolean; items: number; error?: string }>;
    total_fetched: number;
    total_matched: number;
    execution_time_ms: number;
  };
  by_theme: {
    theme: NewsTheme;
    themeName: string;
    keywords: string[];
    items: MatchedNewsItem[];
  }[];
};

// 数据源适配器接口
export type NewsSourceAdapter = {
  id: NewsSourceId;
  name: string;
  nameZh: string;
  url: string;
  fetch: (opts?: { limit?: number; timeoutMs?: number }) => Promise<NewsItem[]>;
};
