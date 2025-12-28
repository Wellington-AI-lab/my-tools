/**
 * GLM-4.7 (Zhipu AI) API Integration
 * As an alternative to Anthropic Claude for tag fusion
 */

export interface GLMConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface NewsItem {
  id: string;
  title: string;
  url?: string;
  content?: string;
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
 * Call GLM-4.7 API for tag fusion
 */
export async function fuseTagsWithGLM(
  input: TagFusionInput,
  config: GLMConfig
): Promise<TagFusionResult> {
  const { apiKey, model = 'glm-4-flash', maxTokens = 500 } = config;

  const apiUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  const prompt = buildGLMFusionPrompt(input);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你是一个智能标签融合专家。只返回 JSON 格式的标签，不要其他内容。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
      signal: controller.signal as any,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      throw new Error('GLM_AUTH_FAILED');
    }

    if (response.status === 429) {
      throw new Error('GLM_RATE_LIMIT');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GLM API failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`GLM API error: ${data.error.message || data.error.code}`);
    }

    const content = data.choices?.[0]?.message?.content || '';

    return parseGLMResponse(content, model);

  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('GLM API timeout');
    }

    throw error;
  }
}

/**
 * Build the fusion prompt for GLM
 */
function buildGLMFusionPrompt(input: TagFusionInput): string {
  const { title, content, cloudflareTags } = input;

  return `你是一个智能标签融合专家。你的任务是审查、补充和优化 AI 生成的新闻标签。

## 新闻信息
标题：${title}
${content ? `正文：${content.slice(0, 500)}...` : ''}

## Cloudflare AI 生成的标签
${cloudflareTags.length > 0 ? cloudflareTags.join(', ') : '(无)'}

## 任务
请分析以上信息，输出最终标签。要求：
1. 保留 Cloudflare AI 中有价值的标签
2. 补充遗漏的重要实体、事件、行业标签
3. 合并重复或过于相似的标签
4. 每个新闻 3-5 个标签
5. 优先级：实体名 > 事件类型 > 行业领域

## 输出格式（严格遵守 JSON）：
{"tags": ["标签1", "标签2", "标签3"], "reasoning": "简要说明"}

只返回 JSON，不要其他内容。`;
}

/**
 * Parse GLM response
 */
function parseGLMResponse(text: string, model: string): TagFusionResult {
  // Try to extract JSON from response (GLM might add extra text)
  const jsonMatch = text.match(/```json\s*(\{[^}]+\})\s*```/) ||
                   text.match(/(\{[^}]+\})/);

  if (!jsonMatch) {
    throw new Error('Failed to parse GLM response');
  }

  const parsed = JSON.parse(jsonMatch[1]);

  return {
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
    reasoning: parsed.reasoning || '',
    model,
  };
}

/**
 * Batch fuse tags for multiple news items using GLM
 */
export async function batchFuseTagsWithGLM(
  items: Array<{ news: NewsItem; cloudflareTags: string[] }>,
  config: GLMConfig,
  batchSize: number = 10
): Promise<Map<string, TagFusionResult>> {
  const results = new Map<string, TagFusionResult>();

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    try {
      const batchResult = await callGLMBatch(batch, config);
      const parsedResults = parseBatchGLMResponse(batchResult, batch.length);

      batch.forEach((item, idx) => {
        if (parsedResults[idx]) {
          results.set(item.news.id, parsedResults[idx]);
        }
      });

    } catch (error) {
      console.error(`[glm] Batch ${i / batchSize + 1} failed:`, error);

      // Fallback: use Cloudflare tags
      batch.forEach(item => {
        results.set(item.news.id, {
          tags: item.cloudflareTags,
          reasoning: 'Using Cloudflare tags (GLM unavailable)',
          model: 'fallback',
        });
      });
    }

    // Small delay between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

/**
 * Call GLM API for batch processing
 */
async function callGLMBatch(
  batch: Array<{ news: NewsItem; cloudflareTags: string[] }>,
  config: GLMConfig
): Promise<string> {
  const { apiKey, model = 'glm-4-flash', maxTokens = 2000 } = config;

  const apiUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  // Build batch prompt
  const itemsText = batch.map((item, idx) => {
    return `## 新闻 ${idx + 1}\n标题：${item.news.title}\nCloudflare AI 标签：${item.cloudflareTags.join(', ') || '(无)'}`;
  }).join('\n\n');

  const prompt = `你是一个智能标签融合专家。请审查并优化以下新闻的标签。

${itemsText}

## 任务
为每条新闻输出 3-5 个最终标签。

## 输出格式（严格遵守 JSON）：
{"results": [{"index": 1, "tags": ["标签1", "标签2"], "reasoning": "理由"}, {"index": 2, "tags": ["标签1", "标签2"], "reasoning": "理由"}]}

只返回 JSON，不要其他内容。`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: '你是一个智能标签融合专家。只返回 JSON 格式的标签，不要其他内容。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GLM batch failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`GLM API error: ${data.error.message || data.error.code}`);
  }

  return data.choices?.[0]?.message?.content || '';
}

/**
 * Parse batch GLM response
 */
function parseBatchGLMResponse(text: string, expectedCount: number): Array<TagFusionResult | null> {
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
      model: 'glm-4',
    }));

  } catch {
    return Array(expectedCount).fill(null);
  }
}

/**
 * Check if GLM is configured
 */
export function isGLMAvailable(env: any): boolean {
  return !!(env.GLM_API_KEY?.trim());
}

/**
 * Error type checking
 */
export function isGLMAuthError(error: unknown): boolean {
  return error instanceof Error && error.message === 'GLM_AUTH_FAILED';
}

export function isGLMRateLimitError(error: unknown): boolean {
  return error instanceof Error && error.message === 'GLM_RATE_LIMIT';
}
