/**
 * Dual AI Tag Fusion Orchestrator
 * Coordinates Cloudflare AI and GLM-4.7 / Anthropic Claude for optimal tag generation
 */

import { CONFIG } from './constants';
import { extractTagsWithAI, type NewsItem, type NewsItemWithTags } from './tags';
import {
  fuseTagsWithAnthropic,
  batchFuseTags,
  isAnthropicAvailable,
  type AnthropicConfig
} from './anthropic';
import {
  fuseTagsWithGLM,
  batchFuseTagsWithGLM,
  isGLMAvailable,
  type GLMConfig
} from './glm';

export interface FusionResult {
  items: NewsItemWithTags[];
  stats: {
    total: number;
    cloudflareOnly: number;
    llmEnhanced: number;
    llmFailed: number;
  };
  apiCalls: {
    cloudflare: number;
    llm: number;
  };
  llmProvider: 'anthropic' | 'glm' | 'none';
}

export interface FusionOptions {
  enableLLM?: boolean;
  llmBatchSize?: number;
  fallbackToCloudflare?: boolean;
}

/**
 * Main fusion entry point
 * Uses Cloudflare AI + LLM (GLM or Anthropic) for optimal tags
 */
export async function extractTagsWithDualAI(
  items: NewsItem[],
  cloudflareEnv: any,
  fusionOptions: FusionOptions = {}
): Promise<FusionResult> {
  const {
    enableLLM = true,
    llmBatchSize = 10,
    fallbackToCloudflare = true,
  } = fusionOptions;

  // Determine which LLM is available
  const hasAnthropic = isAnthropicAvailable(cloudflareEnv);
  const hasGLM = isGLMAvailable(cloudflareEnv);
  const llmProvider: 'anthropic' | 'glm' | 'none' = hasAnthropic ? 'anthropic' : hasGLM ? 'glm' : 'none';
  const hasLLM = enableLLM && llmProvider !== 'none';

  console.log(`[fusion] Starting dual AI processing: ${items.length} items`);
  console.log(`[fusion] LLM provider: ${llmProvider}`);

  // Step 1: Get Cloudflare AI tags
  console.log(`[fusion] Step 1: Cloudflare AI tagging...`);
  const cfResult = await extractTagsWithAI(items, cloudflareEnv);
  const cfItems = cfResult.results;

  // If LLM is not available, return Cloudflare results
  if (!hasLLM) {
    console.log(`[fusion] No LLM configured, using Cloudflare only`);
    return {
      items: cfItems,
      stats: { total: items.length, cloudflareOnly: items.length, llmEnhanced: 0, llmFailed: 0 },
      apiCalls: { cloudflare: cfResult.apiCalls, llm: 0 },
      llmProvider: 'none',
    };
  }

  // Step 2: Prepare items for LLM fusion
  console.log(`[fusion] Step 2: ${llmProvider.toUpperCase()} tag fusion...`);
  const fusionInput = cfItems.map(item => ({
    news: { id: item.id, title: item.title, url: item.url },
    cloudflareTags: item.tags,
  }));

  // Step 3: Call LLM for fusion
  let fusionResults: Map<string, any>;
  let llmSuccess = 0;
  let llmFailed = 0;
  let llmCalls = 0;

  try {
    if (llmProvider === 'anthropic') {
      const anthropicConfig: AnthropicConfig = {
        apiKey: cloudflareEnv.ANTHROPIC_API_KEY,
        model: 'claude-3-5-haiku-20241022',
      };
      fusionResults = await batchFuseTags(fusionInput, anthropicConfig, llmBatchSize);
    } else {
      const glmConfig: GLMConfig = {
        apiKey: cloudflareEnv.GLM_API_KEY,
        model: 'glm-4-flash',
      };
      fusionResults = await batchFuseTagsWithGLM(fusionInput, glmConfig, llmBatchSize);
    }

    llmCalls = Math.ceil(items.length / llmBatchSize);
    llmSuccess = fusionResults.size;
    llmFailed = items.length - llmSuccess;

    console.log(`[fusion] ${llmProvider.toUpperCase()} fusion complete: ${llmSuccess} enhanced, ${llmFailed} failed`);

  } catch (error) {
    console.error(`[fusion] ${llmProvider} batch failed:`, error);
    llmFailed = items.length;

    if (!fallbackToCloudflare) {
      throw error;
    }

    // Return Cloudflare results as fallback
    return {
      items: cfItems,
      stats: { total: items.length, cloudflareOnly: items.length, llmEnhanced: 0, llmFailed: 0 },
      apiCalls: { cloudflare: cfResult.apiCalls, llm: 0 },
      llmProvider: 'none',
    };
  }

  // Step 4: Merge results
  const finalItems = mergeResults(cfItems, fusionResults);

  return {
    items: finalItems,
    stats: {
      total: items.length,
      cloudflareOnly: 0,
      llmEnhanced: llmSuccess,
      llmFailed,
    },
    apiCalls: {
      cloudflare: cfResult.apiCalls,
      llm: llmCalls,
    },
    llmProvider,
  };
}

/**
 * Merge Cloudflare and LLM results
 */
function mergeResults(
  cfItems: NewsItemWithTags[],
  fusionResults: Map<string, any>
): NewsItemWithTags[] {
  return cfItems.map(item => {
    const fusion = fusionResults.get(item.id);

    if (!fusion || !fusion.tags || fusion.tags.length === 0) {
      // No fusion result, use Cloudflare tags
      return {
        ...item,
        tagScore: item.tagScore,
      };
    }

    // Use LLM-enhanced tags
    return {
      ...item,
      tags: fusion.tags.slice(0, CONFIG.MAX_TAGS_PER_ITEM),
      tagScore: calculateFusionScore(item.tags, fusion.tags, item.tagScore),
    };
  });
}

/**
 * Calculate final tag score based on fusion
 */
function calculateFusionScore(
  cfTags: string[],
  llmTags: string[],
  originalScore: number
): number {
  // Base score for LLM-enhanced tags
  const baseScore = 95;

  // Bonus for tag consistency
  const overlap = cfTags.filter(t => llmTags.includes(t)).length;
  const consistencyBonus = overlap * 2;

  // Penalty for large tag count changes
  const countDiff = Math.abs(cfTags.length - llmTags.length);
  const countPenalty = countDiff * 3;

  return Math.min(100, Math.max(60, baseScore + consistencyBonus - countPenalty));
}

/**
 * Quick single-item fusion (for real-time usage)
 */
export async function fuseSingleItem(
  news: NewsItem,
  cloudflareTags: string[],
  llmProvider: 'anthropic' | 'glm',
  apiKey: string
): Promise<NewsItemWithTags> {
  try {
    if (llmProvider === 'anthropic') {
      const result = await fuseTagsWithAnthropic({
        title: news.title,
        cloudflareTags,
      }, { apiKey });

      return {
        id: news.id,
        title: news.title,
        url: news.url,
        tags: result.tags.slice(0, CONFIG.MAX_TAGS_PER_ITEM),
        tagScore: 95,
      };
    } else {
      const result = await fuseTagsWithGLM({
        title: news.title,
        cloudflareTags,
      }, { apiKey });

      return {
        id: news.id,
        title: news.title,
        url: news.url,
        tags: result.tags.slice(0, CONFIG.MAX_TAGS_PER_ITEM),
        tagScore: 95,
      };
    }

  } catch (error) {
    console.warn('[fusion] Single item fusion failed, using Cloudflare tags:', error);
    return {
      id: news.id,
      title: news.title,
      url: news.url,
      tags: cloudflareTags.slice(0, CONFIG.MAX_TAGS_PER_ITEM),
      tagScore: 70,
    };
  }
}

