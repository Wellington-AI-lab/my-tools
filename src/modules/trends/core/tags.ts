/**
 * Tag Extraction Module
 * Handles AI-based and keyword-based tag extraction
 */

import { CONFIG } from './constants';
import { extractKeywords, filterTags, calculateTagScore } from './keywords';

// Type definitions
export interface NewsItem {
  id: string;
  title: string;
  url: string;
}

export interface NewsItemWithTags extends NewsItem {
  tags: string[];
  tagScore: number;
}

export interface TagStats {
  tag: string;
  count: number;
  trend: "up" | "down" | "stable";
  changePercent: number;
}

export interface AIResult {
  results: NewsItemWithTags[];
  quotaExceeded: boolean;
  apiCalls: number;
}

export interface CloudflareEnv {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
}

/**
 * Extract tags using Cloudflare Workers AI
 * Parallel batch processing with controlled concurrency
 */
export async function extractTagsWithAI(
  items: NewsItem[],
  env: CloudflareEnv,
  signal?: AbortSignal
): Promise<AIResult> {
  const { accountId, apiToken } = validateAIConfig(env);
  if (!accountId || !apiToken) {
    throw new Error('AI credentials not configured');
  }

  const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CONFIG.AI_MODEL}`;
  const results: NewsItemWithTags[] = [];
  let quotaExceeded = false;
  let apiCalls = 0;

  // Create batches
  const batches: NewsItem[][] = [];
  for (let i = 0; i < items.length; i += CONFIG.AI_BATCH_SIZE) {
    batches.push(items.slice(i, i + CONFIG.AI_BATCH_SIZE));
  }

  // Process batches with controlled concurrency
  const concurrentBatches: Promise<NewsItemWithTags[]>[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchPromise = processBatch(batch, apiUrl, apiToken, signal, i, batches.length)
      .then(result => {
        if (result.quotaExceeded) quotaExceeded = true;
        apiCalls += result.apiCalls || 1;
        return result.items;
      })
      .catch(error => {
        console.error(`[trends/tags] Batch ${i + 1} failed:`, error);
        // Fallback to keywords
        return batch.map(item => keywordFallback(item));
      });

    concurrentBatches.push(batchPromise);

    // Control concurrency
    if (concurrentBatches.length >= CONFIG.AI_MAX_CONCURRENT || i === batches.length - 1) {
      const batchResults = await Promise.all(concurrentBatches);
      results.push(...batchResults.flat());
      concurrentBatches.length = 0;
    }
  }

  console.log(`[trends/tags] AI processed: ${results.length} items, ${apiCalls} calls, quotaExceeded: ${quotaExceeded}`);

  return { results, quotaExceeded, apiCalls };
}

/**
 * Process a single batch through AI
 */
async function processBatch(
  batch: NewsItem[],
  apiUrl: string,
  apiToken: string,
  signal: AbortSignal | undefined,
  batchIndex: number,
  totalBatches: number
): Promise<{ items: NewsItemWithTags[]; quotaExceeded: boolean; apiCalls: number }> {
  const batchText = batch.map((item, idx) => `${idx + 1}. ${item.title}`).join('\n');

  const prompt = `分析以下新闻标题，提取每个新闻的 3-5 个关键词标签。
标签要求：实体名（人名、公司、国家）、事件类型、行业领域。
只返回 JSON 格式，格式为：[{"index":1,"tags":["标签1","标签2"]},{"index":2,...}]

新闻标题：
${batchText}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.AI_API_TIMEOUT_MS);

  // Combine with external signal if provided
  signal?.addEventListener('abort', () => controller.abort());

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: '你是一个新闻标签提取助手。只返回 JSON 格式的标签，不要其他内容。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: CONFIG.AI_MAX_TOKENS,
      }),
      signal: controller.signal as any,
    });

    clearTimeout(timeoutId);

    if (response.status === 429) {
      console.warn(`[trends/tags] AI quota exceeded (batch ${batchIndex + 1}/${totalBatches})`);
      return { items: [], quotaExceeded: true, apiCalls: 1 };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[trends/tags] AI API error: ${response.status} ${errorText}`);
      throw new Error(`AI API failed: ${response.status}`);
    }

    const data = await response.json();
    const aiText = data.result?.response || data.response || '';

    if (!aiText) {
      console.warn(`[trends/tags] Empty AI response (batch ${batchIndex + 1})`);
      return { items: batch.map(keywordFallback), quotaExceeded: false, apiCalls: 1 };
    }

    // Parse AI response
    const aiTags = parseAITags(aiText);

    const items = batch.map((item, idx) => {
      const aiTagData = aiTags.find(t => t.index === idx + 1);
      const tags = aiTagData?.tags && Array.isArray(aiTagData.tags)
        ? filterTags(aiTagData.tags).slice(0, CONFIG.MAX_TAGS_PER_ITEM)
        : extractKeywords(item.title);

      return {
        id: item.id,
        title: item.title,
        url: item.url,
        tags,
        tagScore: calculateTagScore(tags, true),
      };
    });

    return { items, quotaExceeded: false, apiCalls: 1 };

  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      console.error(`[trends/tags] AI timeout (batch ${batchIndex + 1})`);
    } else {
      console.error(`[trends/tags] AI request failed:`, error);
    }

    // Fallback to keywords
    return { items: batch.map(keywordFallback), quotaExceeded: false, apiCalls: 0 };
  }
}

/**
 * Parse AI tags from response text
 */
function parseAITags(aiText: string): Array<{ index: number; tags: string[] }> {
  try {
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(aiText);
  } catch {
    return [];
  }
}

/**
 * Keyword fallback for failed AI processing
 */
function keywordFallback(item: NewsItem): NewsItemWithTags {
  const tags = filterTags(extractKeywords(item.title)).slice(0, CONFIG.MAX_TAGS_PER_ITEM);
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    tags,
    tagScore: calculateTagScore(tags, false),
  };
}

/**
 * Validate AI configuration
 */
function validateAIConfig(env: CloudflareEnv): { accountId?: string; apiToken?: string } {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();

  if (accountId && apiToken) {
    return { accountId, apiToken };
  }

  return { accountId: undefined, apiToken: undefined };
}

/**
 * Calculate tag statistics from processed news
 */
export function calculateTagStats(
  newsWithTags: NewsItemWithTags[],
  previousStats?: Map<string, number>
): TagStats[] {
  const tagCounts = new Map<string, number>();

  for (const item of newsWithTags) {
    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const stats: TagStats[] = [];
  for (const [tag, count] of tagCounts.entries()) {
    const prevCount = previousStats?.get(tag) || 0;
    let trend: "up" | "down" | "stable" = "stable";
    let changePercent = 0;

    if (count > prevCount) {
      trend = "up";
      changePercent = prevCount > 0 ? ((count - prevCount) / prevCount) * 100 : 100;
    } else if (count < prevCount) {
      trend = "down";
      changePercent = prevCount > 0 ? ((prevCount - count) / prevCount) * 100 : 100;
    }

    stats.push({ tag, count, trend, changePercent });
  }

  return stats
    .sort((a, b) => b.count - a.count)
    .slice(0, CONFIG.MAX_TOP_TAGS);
}

/**
 * Check if AI mode is available
 */
export function isAIModeAvailable(env: CloudflareEnv): boolean {
  return !!(env.CLOUDFLARE_ACCOUNT_ID?.trim() && env.CLOUDFLARE_API_TOKEN?.trim());
}
