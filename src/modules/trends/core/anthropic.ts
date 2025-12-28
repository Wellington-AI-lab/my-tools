/**
 * Anthropic Claude API Integration
 * Used as final decision maker for tag fusion
 */

import { CONFIG } from './constants';
import { generateStrictSystemPrompt } from './tag-taxonomy';

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface NewsItem {
  id: string;
  title: string;
  url?: string;
  content?: string; // Optional full text
}

export interface TagFusionInput {
  title: string;
  content?: string;
  cloudflareTags: string[];
  additionalContext?: string;
}

export interface TagFusionResult {
  tags: string[];
  reasoning: string;
  model: string;
}

/**
 * Call Anthropic Claude API for tag fusion
 */
export async function fuseTagsWithAnthropic(
  input: TagFusionInput,
  config: AnthropicConfig
): Promise<TagFusionResult> {
  const { apiKey, model = 'claude-3-5-haiku-20241022', maxTokens = 500 } = config;

  const apiUrl = 'https://api.anthropic.com/v1/messages';

  const prompt = buildFusionPrompt(input);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }),
      signal: controller.signal as any,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      throw new Error('ANTHROPIC_AUTH_FAILED');
    }

    if (response.status === 429) {
      throw new Error('ANTHROPIC_RATE_LIMIT');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    return parseFusionResponse(content, model);

  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Anthropic API timeout');
    }

    throw error;
  }
}

/**
 * Build the fusion prompt for Claude
 */
function buildFusionPrompt(input: TagFusionInput): string {
  const { title, content, cloudflareTags, additionalContext } = input;

  return `你是一个智能标签融合专家。你的任务是审查、补充和优化 AI 生成的新闻标签。

${generateStrictSystemPrompt()}

## 新闻信息
标题：${title}
${content ? `正文：${content.slice(0, 500)}...` : ''}

## Cloudflare AI 生成的标签
${cloudflareTags.length > 0 ? cloudflareTags.join(', ') : '(无)'}

${additionalContext ? `## 额外信息\n${additionalContext}` : ''}

## 任务
请分析以上信息，输出最终标签。要求：
1. 保留 Cloudflare AI 中有价值的标签
2. 补充遗漏的重要实体、事件、行业标签
3. 合并重复或过于相似的标签
4. 每个新闻 3-5 个标签
5. 优先级：实体名 > 事件类型 > 行业领域

## 输出格式（严格遵守 JSON）：
\`\`\`json
{
  "tags": ["标签1", "标签2", "标签3"],
  "reasoning": "简要说明标签选择理由"
}
\`\`\`

只返回 JSON，不要其他内容。`;
}

/**
 * Parse Anthropic response
 */
function parseFusionResponse(text: string, model: string): TagFusionResult {
  // Extract JSON from response
  const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/) ||
                   text.match(/(\{[\s\S]*?\})/);

  if (!jsonMatch) {
    throw new Error('Failed to parse Anthropic response');
  }

  const parsed = JSON.parse(jsonMatch[1]);

  return {
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
    reasoning: parsed.reasoning || '',
    model,
  };
}

/**
 * Batch fuse tags for multiple news items
 * Processes items in batches to reduce API calls
 */
export async function batchFuseTags(
  items: Array<{ news: NewsItem; cloudflareTags: string[] }>,
  config: AnthropicConfig,
  batchSize: number = 10
): Promise<Map<string, TagFusionResult>> {
  const results = new Map<string, TagFusionResult>();

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    // Build batch prompt
    const batchPrompt = buildBatchFusionPrompt(batch);

    try {
      const batchResult = await callAnthropicBatch(batchPrompt, config);

      // Parse batch results
      const parsedResults = parseBatchFusionResponse(batchResult, batch.length);

      batch.forEach((item, idx) => {
        if (parsedResults[idx]) {
          results.set(item.news.id, parsedResults[idx]);
        }
      });

    } catch (error) {
      console.error(`[anthropic] Batch ${i / batchSize + 1} failed:`, error);

      // Fallback: use Cloudflare tags
      batch.forEach(item => {
        results.set(item.news.id, {
          tags: item.cloudflareTags,
          reasoning: 'Using Cloudflare tags (Anthropic unavailable)',
          model: 'fallback',
        });
      });
    }

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

/**
 * Build batch fusion prompt
 */
function buildBatchFusionPrompt(
  items: Array<{ news: NewsItem; cloudflareTags: string[] }>
): string {
  const itemsText = items.map((item, idx) => {
    return `## 新闻 ${idx + 1}
标题：${item.news.title}
Cloudflare AI 标签：${item.cloudflareTags.join(', ') || '(无)'}`;
  }).join('\n\n');

  return `你是一个智能标签融合专家。

${generateStrictSystemPrompt()}

${itemsText}

## 任务
为每条新闻输出 3-5 个最终标签。标签必须从上面的白名单中选择。

## 输出格式（严格遵守 JSON）：
\`\`\`json
{
  "results": [
    {"index": 1, "tags": ["标签1", "标签2"], "reasoning": "理由"},
    {"index": 2, "tags": ["标签1", "标签2"], "reasoning": "理由"}
  ]
}
\`\`\`

只返回 JSON，不要其他内容。`;
}

/**
 * Call Anthropic API for batch processing
 */
async function callAnthropicBatch(
  prompt: string,
  config: AnthropicConfig
): Promise<string> {
  const { apiKey, model = 'claude-3-5-haiku-20241022', maxTokens = 2000 } = config;

  const apiUrl = 'https://api.anthropic.com/v1/messages';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic batch failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

/**
 * Parse batch fusion response
 */
function parseBatchFusionResponse(text: string, expectedCount: number): Array<TagFusionResult | null> {
  const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/) ||
                   text.match(/(\{[\s\S]*?\})/);

  if (!jsonMatch) {
    return Array(expectedCount).fill(null);
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]);

    if (!Array.isArray(parsed.results)) {
      return Array(expectedCount).fill(null);
    }

    return parsed.results.map((r: any) => ({
      tags: Array.isArray(r.tags) ? r.tags.slice(0, 5) : [],
      reasoning: r.reasoning || '',
      model: 'claude',
    }));

  } catch {
    return Array(expectedCount).fill(null);
  }
}

/**
 * Check if Anthropic is configured
 */
export function isAnthropicAvailable(env: any): boolean {
  return !!(env.ANTHROPIC_API_KEY?.trim());
}

/**
 * Error type checking
 */
export function isAuthError(error: unknown): boolean {
  return error instanceof Error && error.message === 'ANTHROPIC_AUTH_FAILED';
}

export function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && error.message === 'ANTHROPIC_RATE_LIMIT';
}
