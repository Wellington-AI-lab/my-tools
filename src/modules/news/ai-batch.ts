/**
 * Batch AI Enrichment with Resilience
 *
 * Uses Promise.allSettled for partial success handling.
 * Suitable for background processing or on-demand batch requests.
 */

import type { RefinedArticle, EnrichedArticle, AIEnrichment } from './types';
import type { KVStorage } from '@/lib/storage/kv';
import { getCachedEnrichment, setCachedEnrichment } from './ai-refinery';
import { openAICompatibleChatCompletion } from '@/modules/in-depth-analysis/llm/openai-compatible-client';

// ============================================================================
// Configuration
// ============================================================================

const BATCH_CONFIG = {
  MAX_CONCURRENT: 3,        // Max parallel LLM calls
  PER_ITEM_TIMEOUT: 12000,  // 12s per item
  RETRY_DELAYS: [1000, 2000], // Retry delays for failed items
};

// ============================================================================
// System Prompt (condensed)
// ============================================================================

const SYSTEM_PROMPT = `You analyze news for signal. Return JSON:
{
  "category": "engineering|ai|business|product|science|opinion|noise",
  "bottom_line": "One-sentence factual summary.",
  "signal_score": 0-10,
  "key_insights": ["insight1", "insight2"]
}

Scoring: 9-10 paradigm shift, 7-8 significant, 5-6 useful, 3-4 minor, 0-2 noise.`;

// ============================================================================
// Types
// ============================================================================

export interface BatchResult {
  successful: EnrichedArticle[];
  failed: Array<{ url: string; error: string }>;
  cached: number;
  processed: number;
  total: number;
}

export interface EnrichmentRequest {
  url: string;
  title: string;
  summary: string;
  source?: string;
}

// ============================================================================
// Single Item Processing
// ============================================================================

async function processSingleItem(
  item: EnrichmentRequest,
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<AIEnrichment> {
  const prompt = `Title: ${item.title}\nSource: ${item.source || ''}\nContent: ${item.summary.slice(0, 800)}`;

  const response = await openAICompatibleChatCompletion({
    baseUrl,
    apiKey,
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    maxTokens: 400,
    timeoutMs: BATCH_CONFIG.PER_ITEM_TIMEOUT,
  });

  // Parse response
  let cleaned = response.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned);

  const validCategories = ['engineering', 'ai', 'business', 'product', 'science', 'opinion', 'noise'];
  const category = validCategories.includes(parsed.category) ? parsed.category : 'noise';

  return {
    category,
    bottom_line: parsed.bottom_line || '',
    signal_score: Math.max(0, Math.min(10, parsed.signal_score || 0)),
    key_insights: Array.isArray(parsed.key_insights)
      ? parsed.key_insights.slice(0, 2)
      : undefined,
  };
}

// ============================================================================
// Batch Processing with allSettled
// ============================================================================

/**
 * Enrich multiple articles with resilience.
 * Returns both successful and failed results.
 */
export async function enrichBatch(
  articles: RefinedArticle[],
  opts: {
    kv?: KVStorage;
    baseUrl: string;
    apiKey: string;
    model: string;
    onProgress?: (result: BatchResult) => void;
  }
): Promise<BatchResult> {
  const { kv, baseUrl, apiKey, model, onProgress } = opts;

  const result: BatchResult = {
    successful: [],
    failed: [],
    cached: 0,
    processed: 0,
    total: articles.length,
  };

  // Convert articles to enrichment requests
  const requests: EnrichmentRequest[] = articles.map(a => ({
    url: a.url,
    title: a.title,
    summary: a.summary,
    source: a.source,
  }));

  // Phase 1: Check cache for all items
  const cacheChecks = await Promise.allSettled(
    requests.map(req =>
      kv ? getCachedEnrichment(kv, req.url) : Promise.resolve(null)
    )
  );

  // Separate cached and uncached
  const toProcess: Array<{ index: number; request: EnrichmentRequest }> = [];
  const cachedResults: Map<number, AIEnrichment> = new Map();

  for (let i = 0; i < cacheChecks.length; i++) {
    const check = cacheChecks[i];
    if (check.status === 'fulfilled' && check.value) {
      cachedResults.set(i, check.value);
      result.cached++;
    } else {
      toProcess.push({ index: i, request: requests[i] });
    }
  }

  // Phase 2: Process uncached items in batches
  const processingBatches = chunkArray(toProcess, BATCH_CONFIG.MAX_CONCURRENT);

  for (const batch of processingBatches) {
    const batchResults = await Promise.allSettled(
      batch.map(({ request }) =>
        processSingleItem(request, baseUrl, apiKey, model)
      )
    );

    // Collect results
    for (let i = 0; i < batch.length; i++) {
      const { index, request } = batch[i];
      const batchResult = batchResults[i];

      if (batchResult.status === 'fulfilled') {
        const enrichment = batchResult.value;

        // Cache the result
        if (kv) {
          setCachedEnrichment(kv, request.url, enrichment).catch(() => {});
        }

        // Create enriched article
        const article = articles[index];
        result.successful.push({
          ...article,
          ai_enriched: true,
          ai_category: enrichment.category,
          ai_bottom_line: enrichment.bottom_line,
          ai_signal_score: enrichment.signal_score,
          ai_key_insights: enrichment.key_insights,
        });
        result.processed++;
      } else {
        result.failed.push({
          url: request.url,
          error: batchResult.reason?.message || 'Unknown error',
        });
      }
    }

    onProgress?.({ ...result });
  }

  // Add cached results to successful
  for (const [index, enrichment] of cachedResults) {
    const article = articles[index];
    result.successful.push({
      ...article,
      ai_enriched: true,
      ai_category: enrichment.category,
      ai_bottom_line: enrichment.bottom_line,
      ai_signal_score: enrichment.signal_score,
      ai_key_insights: enrichment.key_insights,
    });
  }

  // Sort by original order
  const urlToIndex = new Map(articles.map((a, i) => [a.url, i]));
  result.successful.sort((a, b) =>
    (urlToIndex.get(a.url) ?? 0) - (urlToIndex.get(b.url) ?? 0)
  );

  return result;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
