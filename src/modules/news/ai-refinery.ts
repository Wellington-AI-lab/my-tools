/**
 * AI Refinery - LLM-powered News Enrichment
 *
 * 使用 LLM 对新闻进行智能分类、总结和信号评分
 * 基于 First Principles: 创新 vs 渐进，信号 vs 噪音
 */

import type { RefinedArticle, AIEnrichment, EnrichedArticle, ArticleCategory } from './types';
import type { KVStorage } from '@/lib/storage/kv';
import { openAICompatibleChatCompletion } from '@/lib/llm/openai-client';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // 缓存 TTL: 7 天 (新闻的 AI 分析结果长期有效)
  CACHE_TTL_SEC: 7 * 24 * 60 * 60,

  // 批处理大小 (避免 token 溢出)
  BATCH_SIZE: 5,

  // 最大并发批处理
  MAX_CONCURRENT_BATCHES: 2,

  // LLM 超时
  LLM_TIMEOUT_MS: 15000,

  // 最小信号分数 (低于此值标记为 noise)
  MIN_SIGNAL_SCORE: 3,
};

// ============================================================================
// System Prompts
// ============================================================================

/**
 * AI Refinery System Prompt
 *
 * 核心原则: First Principles Thinking
 * - 创新: 是否引入了新的范式、技术或方法？
 * - 影响力: 是否对行业/社会有实质性影响？
 * - 信噪比: 是高密度信息还是营销噪音？
 */
const SYSTEM_PROMPT = `You are a signal detection engine. Your job is to extract high-signal insights from news articles.

# First Principles Framework

## Categories
- **engineering**: Technical implementation, architecture, engineering breakthroughs
- **ai**: AI/ML research, models, applications, infrastructure
- **business**: Funding, M&A, market dynamics, business models
- **product**: Product launches, features, updates
- **science**: Scientific research, discoveries, papers
- **opinion': Editorials, analysis, commentary
- **noise**: Low-value content (marketing fluff, minor updates, reposts)

## Signal Scoring (0-10)
Score based on **innovation potential** and **impact magnitude**:
- **9-10**: Paradigm shift, breakthrough, industry-defining
- **7-8**: Significant innovation, notable impact
- **5-6**: Useful but incremental, moderate impact
- **3-4**: Minor update, limited impact
- **0-2**: Noise, marketing, negligible value

## Bottom Line Format
One sentence, factual, no fluff. Present tense.
- Good: "OpenAI releases GPT-5 with reasoning capabilities."
- Bad: "OpenAI just announced something exciting!"

# Output Format
Return ONLY a JSON array (no markdown, no code fences):
\`\`\`json
[
  {
    "index": 0,
    "category": "engineering|ai|business|product|science|opinion|noise",
    "bottom_line": "One-sentence summary.",
    "signal_score": 7,
    "key_insights": ["insight1", "insight2"]
  }
]
\`\`\``;

// ============================================================================
// Cache Layer
// ============================================================================

const AI_CACHE_PREFIX = 'news:ai:v1:';

/**
 * 生成 AI 缓存键
 */
function getCacheKey(url: string): string {
  // 使用 URL 的 hash 作为缓存键
  const urlHash = Buffer.from(url).toString('base64').slice(0, 16);
  return `${AI_CACHE_PREFIX}${urlHash}`;
}

/**
 * 从缓存获取 AI 增强结果
 */
export async function getCachedEnrichment(
  kv: KVStorage,
  url: string
): Promise<AIEnrichment | null> {
  try {
    const cached = await kv.get(getCacheKey(url), { type: 'json' }) as AIEnrichment | null;
    return cached;
  } catch {
    return null;
  }
}

/**
 * 保存 AI 增强结果到缓存
 */
export async function setCachedEnrichment(
  kv: KVStorage,
  url: string,
  enrichment: AIEnrichment
): Promise<void> {
  try {
    await kv.put(getCacheKey(url), JSON.stringify(enrichment), {
      expirationTtl: CONFIG.CACHE_TTL_SEC,
    });
  } catch (error) {
    console.warn('[ai-refinery] Failed to cache enrichment:', error);
  }
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * 批量 AI 增强处理
 */
export async function enrichArticlesBatch(
  articles: RefinedArticle[],
  opts: {
    kv?: KVStorage;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    onProgress?: (processed: number, total: number) => void;
  } = {}
): Promise<EnrichedArticle[]> {
  const { kv, baseUrl, apiKey, model, onProgress } = opts;

  // 缺少 LLM 配置时返回空数组
  if (!baseUrl || !apiKey || !model) {
    console.warn('[ai-refinery] LLM not configured, skipping enrichment');
    return [];
  }

  const results: EnrichedArticle[] = [];
  const toProcess: RefinedArticle[] = [];
  const cacheLookupPromises: Promise<void>[] = [];

  // 第一阶段: 并发查找缓存
  for (const article of articles) {
    if (kv) {
      cacheLookupPromises.push(
        (async () => {
          const cached = await getCachedEnrichment(kv, article.url);
          if (cached) {
            results.push(applyEnrichment(article, cached));
          } else {
            toProcess.push(article);
          }
        })()
      );
    } else {
      toProcess.push(article);
    }
  }

  await Promise.all(cacheLookupPromises);

  // 第二阶段: 批量处理未缓存的文章
  if (toProcess.length > 0) {
    const batches = chunkArray(toProcess, CONFIG.BATCH_SIZE);
    let processed = 0;

    // 限制并发批处理
    for (let i = 0; i < batches.length; i += CONFIG.MAX_CONCURRENT_BATCHES) {
      const batchGroup = batches.slice(i, i + CONFIG.MAX_CONCURRENT_BATCHES);

      const batchResults = await Promise.allSettled(
        batchGroup.map(batch => processBatch(batch, { baseUrl, apiKey, model }))
      );

      // 合并结果
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          for (let j = 0; j < result.value.length; j++) {
            const enriched = result.value[j];
            if (enriched) {
              results.push(enriched);

              // 缓存结果
              if (kv) {
                await setCachedEnrichment(kv, enriched.url, extractEnrichment(enriched));
              }
            }
          }
          processed += result.value.filter(Boolean).length;
        }
      }

      onProgress?.(results.length, articles.length);
    }
  }

  // 按原始顺序排序
  const urlToIndex = new Map(articles.map((a, i) => [a.url, i]));
  results.sort((a, b) => (urlToIndex.get(a.url) ?? 0) - (urlToIndex.get(b.url) ?? 0));

  return results;
}

/**
 * 处理单个批次
 */
async function processBatch(
  batch: RefinedArticle[],
  opts: { baseUrl: string; apiKey: string; model: string }
): Promise<(EnrichedArticle | null)[]> {
  try {
    const enrichments = await callLLM(batch, opts);
    return batch.map((article, i) => {
      const enrichment = enrichments[i];
      return enrichment ? applyEnrichment(article, enrichment) : null;
    });
  } catch (error) {
    console.error('[ai-refinery] Batch processing failed:', error);
    return batch.map(() => null);
  }
}

/**
 * 调用 LLM 进行批量分析
 */
async function callLLM(
  batch: RefinedArticle[],
  opts: { baseUrl: string; apiKey: string; model: string }
): Promise<AIEnrichment[]> {
  const userPrompt = buildUserPrompt(batch);

  const response = await openAICompatibleChatCompletion({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    model: opts.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,  // 低温度以获得一致的结果
    maxTokens: 2000,
    timeoutMs: CONFIG.LLM_TIMEOUT_MS,
  });

  return parseLLMResponse(response, batch.length);
}

/**
 * 构建用户提示
 */
function buildUserPrompt(batch: RefinedArticle[]): string {
  const items = batch.map((article, i) => {
    return `## [${i}]
Title: ${article.title}
Source: ${article.source}
Summary: ${article.summary.slice(0, 500)}
URL: ${article.url}`;
  }).join('\n\n');

  return `Analyze ${batch.length} article(s) and extract signal:\n\n${items}`;
}

/**
 * 解析 LLM 响应
 */
function parseLLMResponse(response: string, expectedCount: number): AIEnrichment[] {
  // 清理响应 (移除可能的 markdown 代码块)
  let cleaned = response.trim();

  // 移除 ```json 和 ```
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/, '');

  // 解析 JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error('[ai-refinery] Failed to parse LLM response:', cleaned);
    return [];
  }

  // 验证结构
  if (!Array.isArray(parsed)) {
    console.error('[ai-refinery] LLM response is not an array');
    return [];
  }

  // 转换为 AIEnrichment
  const enrichments: AIEnrichment[] = [];

  for (const item of parsed) {
    if (
      typeof item === 'object' && item !== null &&
      'index' in item && typeof item.index === 'number' &&
      'category' in item && typeof item.category === 'string' &&
      'bottom_line' in item && typeof item.bottom_line === 'string' &&
      'signal_score' in item && typeof item.signal_score === 'number'
    ) {
      enrichments.push({
        category: validateCategory(item.category),
        bottom_line: item.bottom_line,
        signal_score: Math.max(0, Math.min(10, item.signal_score)),
        key_insights: Array.isArray(item.key_insights)
          ? item.key_insights.filter((i: unknown) => typeof i === 'string').slice(0, 3)
          : undefined,
      });
    }
  }

  // 按 index 排序
  enrichments.sort((a, b) => 0 /* index lost in mapping, maintain order */);

  return enrichments;
}

/**
 * 验证分类值
 */
function validateCategory(value: string): ArticleCategory {
  const valid: ArticleCategory[] = ['engineering', 'ai', 'business', 'product', 'science', 'opinion', 'noise'];
  return valid.includes(value as ArticleCategory) ? (value as ArticleCategory) : 'noise';
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 应用 AI 增强结果到文章
 */
function applyEnrichment(article: RefinedArticle, enrichment: AIEnrichment): EnrichedArticle {
  return {
    ...article,
    ai_enriched: true,
    ai_category: enrichment.category,
    ai_bottom_line: enrichment.bottom_line,
    ai_signal_score: enrichment.signal_score,
    ai_key_insights: enrichment.key_insights,
  };
}

/**
 * 从增强后的文章提取 AIEnrichment
 */
function extractEnrichment(article: EnrichedArticle): AIEnrichment {
  return {
    category: article.ai_category,
    bottom_line: article.ai_bottom_line,
    signal_score: article.ai_signal_score,
    key_insights: article.ai_key_insights,
  };
}

/**
 * 分块数组
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
