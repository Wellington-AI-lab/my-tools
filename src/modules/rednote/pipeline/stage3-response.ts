import type { RednoteAgentResponse, RednoteFeedCard } from '@/modules/rednote/types';

export function stage3BuildResponse(opts: {
  executionTimeMs: number;
  scanned: number;
  filtered: number;
  usedDatasource: 'mock' | 'apify';
  usedReasoning: 'llm' | 'mock';
  logs: RednoteAgentResponse['logs'];
  insight: string;
  trends: string[];
  feed: RednoteFeedCard[];
}): RednoteAgentResponse {
  return {
    meta: {
      execution_time_ms: Math.max(0, Math.floor(opts.executionTimeMs)),
      items_scanned: Math.max(0, Math.floor(opts.scanned)),
      items_filtered: Math.max(0, Math.floor(opts.filtered)),
      used_datasource: opts.usedDatasource,
      used_reasoning: opts.usedReasoning,
    },
    logs: opts.logs,
    insight: String(opts.insight || ''),
    trends: Array.isArray(opts.trends) ? opts.trends.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 3) : [],
    feed: Array.isArray(opts.feed) ? opts.feed : [],
  };
}


