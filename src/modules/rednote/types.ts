export type RednoteTimeRangePreset = '24h' | '7d' | '30d';

/**
 * A deliberately messy/raw item shape that can come from:
 * - Mock JSON (development)
 * - Apify actor output (future)
 *
 * Keep fields permissive because real-world social data is inconsistent.
 */
export type RednoteRawItem = {
  id?: string | number | null;
  noteId?: string | number | null;
  url?: string | null;

  title?: string | null;
  content?: string | null;
  desc?: string | null;

  author?: string | null;
  authorId?: string | number | null;

  createdAt?: string | number | null;
  updatedAt?: string | number | null;

  likes?: string | number | null;
  collects?: string | number | null;
  comments?: string | number | null;
  shares?: string | number | null;

  tags?: unknown;
  images?: unknown;
  extra?: Record<string, unknown> | null;
};

export type RednoteFeedCard = {
  id: string;
  url?: string;
  title: string;
  content: string;

  author?: string;
  createdAt?: string;

  metrics: {
    likes: number;
    collects: number;
    comments: number;
    shares: number;
    heatScore: number;
  };

  /**
   * Output from Stage 2 (LLM / mock reasoning).
   * Keep it optional so the pipeline can still run without LLM.
   */
  authenticity?: {
    label: 'real_experience' | 'generic_marketing_copy' | 'unclear';
    rationale: string;
  };

  /** for debugging / future use */
  tags?: string[];
};

export type RednoteAgentRequest = {
  keyword: string;
  timeRange: RednoteTimeRangePreset;
  heatThreshold?: number;
  topK?: number;
};

export type RednoteAgentResponse = {
  meta: {
    execution_time_ms: number;
    items_scanned: number;
    items_filtered: number;
    used_datasource: 'mock' | 'apify';
    used_reasoning: 'llm' | 'mock';
  };
  logs: Array<{ ts: string; stage: 'stage1' | 'stage2' | 'stage3'; message: string }>;
  insight: string; // markdown
  trends: string[];
  feed: RednoteFeedCard[];
};


