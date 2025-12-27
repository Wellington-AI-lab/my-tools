export type TrendTheme =
  | 'finance'
  | 'economy'
  | 'ai'
  | 'robotics'
  | 'travel'
  | 'music'
  | 'movies'
  | 'fashion'
  | 'entertainment';

export type TrendSourceId = 'google_trends_rss' | 'weibo_hot' | 'mock';

export type TrendRawItem = {
  source: TrendSourceId;
  title: string;
  url?: string;
  rank?: number;
  score?: number; // platform-provided “heat” if any
  language?: 'zh' | 'en' | 'unknown';
  publishedAt?: string; // ISO if known
  extra?: Record<string, unknown>;
};

export type TrendCard = {
  id: string;
  source: TrendSourceId;
  title: string;
  url?: string;
  language: 'zh' | 'en' | 'unknown';
  themes: TrendTheme[];
  signals: {
    score: number; // unified score for sorting (0..)
  };
};

export type TrendsReport = {
  meta: {
    generated_at: string; // ISO
    day_key: string; // YYYY-MM-DD in Asia/Shanghai
    sources_used: TrendSourceId[];
    /**
     * Per-source health status for this run.
     * Useful for operating a "best-effort" scraper setup.
     */
    source_status?: Partial<
      Record<
        TrendSourceId,
        {
          ok: boolean;
          items: number;
          error?: string;
        }
      >
    >;
    items_scanned: number;
    items_kept: number;
    execution_time_ms: number;
    llm_used: 'llm' | 'mock';
  };
  logs: Array<{ ts: string; stage: 'fetch' | 'filter' | 'reason' | 'store'; message: string }>;
  trends_by_theme: Array<{
    theme: TrendTheme;
    keywords: string[]; // short list
    cards: TrendCard[];
  }>;
  insight_markdown: string;
};


