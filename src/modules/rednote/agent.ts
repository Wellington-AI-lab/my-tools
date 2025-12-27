import type { RednoteAgentRequest, RednoteAgentResponse } from '@/modules/rednote/types';
import { fetchRednoteRawMock } from '@/modules/rednote/datasource/mock';
import { fetchRednoteRawFromApify } from '@/modules/rednote/datasource/apify';
import { DEFAULT_BLACKLIST, stage1Filter } from '@/modules/rednote/pipeline/stage1-filter';
import { stage2Reasoning } from '@/modules/rednote/pipeline/stage2-llm';
import { stage3BuildResponse } from '@/modules/rednote/pipeline/stage3-response';

function nowIso() {
  return new Date().toISOString();
}

export async function runRednoteAgent(opts: {
  env: {
    LLM_BASE_URL?: string;
    LLM_API_KEY?: string;
    LLM_MODEL?: string;
    APIFY_TOKEN?: string;
  };
  req: RednoteAgentRequest;
}): Promise<RednoteAgentResponse> {
  const started = Date.now();
  const logs: RednoteAgentResponse['logs'] = [];
  const log = (stage: 'stage1' | 'stage2' | 'stage3', message: string) => {
    logs.push({ ts: nowIso(), stage, message });
  };

  const keyword = String(opts.req.keyword || '').trim();
  const timeRange = opts.req.timeRange;
  const heatThreshold = Number.isFinite(opts.req.heatThreshold) ? Number(opts.req.heatThreshold) : 50;
  const topK = Number.isFinite(opts.req.topK) ? Number(opts.req.topK) : 24;

  const maxItemsAfterFilter = Math.max(10, Math.min(60, Math.floor(topK)));
  const reasoningTop = Math.max(10, Math.min(15, Math.min(maxItemsAfterFilter, 15)));

  log('stage1', 'Fetching raw feed…');

  let usedDatasource: 'mock' | 'apify' = 'mock';
  let rawItems: any[] = [];
  try {
    if (opts.env.APIFY_TOKEN) {
      // Prefer Apify when configured, but degrade safely.
      const r = await fetchRednoteRawFromApify({
        env: { APIFY_TOKEN: opts.env.APIFY_TOKEN },
        keyword,
        timeRange,
      });
      rawItems = r.items ?? [];
      usedDatasource = 'apify';
    } else {
      const r = await fetchRednoteRawMock({ keyword, timeRange });
      rawItems = r.items ?? [];
      usedDatasource = 'mock';
    }
  } catch (e) {
    // If Apify path fails, fall back to mock.
    log('stage1', `Datasource error, falling back to mock: ${e instanceof Error ? e.message : String(e)}`);
    const r = await fetchRednoteRawMock({ keyword, timeRange });
    rawItems = r.items ?? [];
    usedDatasource = 'mock';
  }

  log('stage1', `Scanned ${rawItems.length} raw items.`);
  log('stage1', `Hard filtering: HeatScore>=${heatThreshold}, blacklist, dedup (中文2-gram阈值 0.66)…`);

  const s1 = stage1Filter(rawItems, {
    heatThreshold,
    dedupTitleSimilarityThreshold: 0.66,
    blacklistKeywords: Array.from(DEFAULT_BLACKLIST),
    maxItemsAfterFilter,
  });

  log('stage1', `After hard filter: ${s1.keptAfterHardFilter}. After dedup: ${s1.keptAfterDedup}.`);
  const feed = s1.cards;

  log('stage2', `Deep reasoning on top ${Math.min(reasoningTop, feed.length)} items…`);
  const s2 = await stage2Reasoning({
    env: {
      LLM_BASE_URL: opts.env.LLM_BASE_URL,
      LLM_API_KEY: opts.env.LLM_API_KEY,
      LLM_MODEL: opts.env.LLM_MODEL,
    },
    keyword,
    items: feed.slice(0, Math.min(reasoningTop, feed.length)),
  });

  // Merge authenticity back to full feed (only the top items will have it).
  for (const c of feed) {
    const a = s2.authenticityById.get(c.id);
    if (a) c.authenticity = { label: a.label, rationale: a.rationale };
  }

  log('stage2', `Reasoning used: ${s2.used === 'llm' ? 'LLM' : 'mock'}. Trends extracted: ${s2.trends.join('、') || '（暂无）'}`);

  log('stage3', 'Constructing response…');
  const resp = stage3BuildResponse({
    executionTimeMs: Date.now() - started,
    scanned: s1.scanned,
    filtered: s1.keptAfterDedup,
    usedDatasource,
    usedReasoning: s2.used,
    logs,
    insight: s2.insight,
    trends: s2.trends,
    feed,
  });
  log('stage3', `Done in ${resp.meta.execution_time_ms}ms.`);

  // Ensure the final response contains the final log line.
  resp.logs = logs;
  return resp;
}


