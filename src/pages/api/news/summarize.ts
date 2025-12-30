/**
 * Single-Item AI Summarization Endpoint
 *
 * POST /api/news/summarize
 *
 * Async-First Architecture:
 * - Fast path: Returns cached enrichment immediately
 * - Slow path: Processes item and caches result for next time
 * - Triggered on-demand (viewport intersection or user click)
 *
 * Request Body:
 * {
 *   url: string;
 *   title: string;
 *   summary: string;  // content preview
 *   source: string;
 * }
 *
 * Response:
 * {
 *   success: true;
 *   data: {
 *     url: string;
 *     category: ArticleCategory;
 *     bottom_line: string;
 *     signal_score: number;
 *     key_insights?: string[];
 *   };
 *   cached: boolean;
 *   timestamp: string;
 * }
 */

import { requireKV, getEnv } from '@/lib/env';
import { getCachedEnrichment, setCachedEnrichment } from '@/modules/news/ai-refinery';
import type { AIEnrichment, ArticleCategory } from '@/modules/news/types';
import { openAICompatibleChatCompletion } from '@/modules/in-depth-analysis/llm/openai-compatible-client';
import type { KVStorage } from '@/lib/storage/kv';

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are a signal detection engine. Extract high-signal insights from news.

# Categories
- engineering: Technical/Architecture/Engineering
- ai: AI/ML research/models/infrastructure
- business: Funding/M&A/markets
- product: Launches/features/updates
- science: Research/discoveries
- opinion: Commentary/analysis
- noise: Low-value/marketing/minor

# Signal Score (0-10)
- 9-10: Paradigm shift, breakthrough
- 7-8: Significant innovation
- 5-6: Useful but incremental
- 3-4: Minor update
- 0-2: Noise/marketing

# Output
JSON ONLY (no markdown):
\`\`\`json
{
  "category": "engineering|ai|business|product|science|opinion|noise",
  "bottom_line": "One-sentence factual summary.",
  "signal_score": 7,
  "key_insights": ["insight1", "insight2"]
}
\`\`\``;

// ============================================================================
// Types
// ============================================================================

// 输入长度限制
const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 5000;  // 限制 summary 长度，防止 token 浪费
const MAX_SOURCE_LENGTH = 100;

interface SummarizeRequest {
  url: string;
  title: string;
  summary: string;
  source?: string;
}

interface SummarizeResponse {
  success: boolean;
  data?: AIEnrichment & { url: string };
  cached?: boolean;
  timestamp?: string;
  error?: string;
}

/**
 * 验证输入数据
 */
function validateInput(data: unknown): data is SummarizeRequest {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;

  const hasValidUrl =
    typeof d.url === 'string' &&
    d.url.length > 0 &&
    d.url.length <= MAX_URL_LENGTH;

  const hasValidTitle =
    typeof d.title === 'string' &&
    d.title.length > 0 &&
    d.title.length <= MAX_TITLE_LENGTH;

  // summary 和 source 是可选的
  const hasValidSummary =
    d.summary === undefined ||
    (typeof d.summary === 'string' && d.summary.length <= MAX_SUMMARY_LENGTH);

  const hasValidSource =
    d.source === undefined ||
    (typeof d.source === 'string' && d.source.length <= MAX_SOURCE_LENGTH);

  return hasValidUrl && hasValidTitle && hasValidSummary && hasValidSource;
}

// ============================================================================
// Helpers
// ============================================================================

function validateCategory(value: string): ArticleCategory {
  const valid: ArticleCategory[] = ['engineering', 'ai', 'business', 'product', 'science', 'opinion', 'noise'];
  return valid.includes(value as ArticleCategory) ? (value as ArticleCategory) : 'noise';
}

function buildPrompt(item: SummarizeRequest): string {
  return `Analyze this article:

Title: ${item.title}
Source: ${item.source || 'Unknown'}
Content: ${item.summary.slice(0, 1000)}

Return JSON with category, bottom_line, signal_score, key_insights.`;
}

async function processItem(
  item: SummarizeRequest,
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<AIEnrichment> {
  const response = await openAICompatibleChatCompletion({
    baseUrl,
    apiKey,
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(item) },
    ],
    temperature: 0.2,
    maxTokens: 500,
    timeoutMs: 12000,  // 12s timeout
  });

  // Parse JSON response
  let cleaned = response.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/, '');

  const parsed = JSON.parse(cleaned);

  if (
    typeof parsed !== 'object' ||
    !parsed.category ||
    !parsed.bottom_line ||
    typeof parsed.signal_score !== 'number'
  ) {
    throw new Error('Invalid LLM response structure');
  }

  return {
    category: validateCategory(parsed.category),
    bottom_line: parsed.bottom_line,
    signal_score: Math.max(0, Math.min(10, parsed.signal_score)),
    key_insights: Array.isArray(parsed.key_insights)
      ? parsed.key_insights.filter((i: unknown) => typeof i === 'string').slice(0, 3)
      : undefined,
  };
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST({ locals, request }: {
  locals: App.Locals;
  request: Request;
}) {
  const kv = requireKV(locals);
  const envVars = getEnv(locals);

  // Check LLM config
  const llmBaseUrl = envVars.LLM_BASE_URL as string | undefined;
  const llmApiKey = envVars.LLM_API_KEY as string | undefined;
  const llmModel = envVars.LLM_MODEL as string | undefined;

  if (!llmBaseUrl || !llmApiKey || !llmModel) {
    return Response.json({
      success: false,
      error: 'LLM not configured. Set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.',
      timestamp: new Date().toISOString(),
    } as SummarizeResponse, { status: 503 });
  }

  // Parse request
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({
      success: false,
      error: 'Invalid JSON body',
      timestamp: new Date().toISOString(),
    } as SummarizeResponse, { status: 400 });
  }

  // Validate input with length limits
  if (!validateInput(body)) {
    return Response.json({
      success: false,
      error: `Invalid input. Limits: url(${MAX_URL_LENGTH}), title(${MAX_TITLE_LENGTH}), summary(${MAX_SUMMARY_LENGTH}), source(${MAX_SOURCE_LENGTH})`,
      timestamp: new Date().toISOString(),
    } as SummarizeResponse, { status: 400 });
  }

  const { url, title, summary, source } = body;

  try {
    // FAST PATH: Check cache first
    const cached = await getCachedEnrichment(kv, url);
    if (cached) {
      console.log(`[api/news/summarize] Cache HIT: ${url}`);
      return Response.json({
        success: true,
        data: { ...cached, url },
        cached: true,
        timestamp: new Date().toISOString(),
      } as SummarizeResponse);
    }

    console.log(`[api/news/summarize] Cache MISS, processing: ${url}`);

    // SLOW PATH: Process and cache
    const enrichment = await processItem(
      { url, title, summary: summary || '', source },
      llmBaseUrl,
      llmApiKey,
      llmModel
    );

    // Cache for 7 days
    await setCachedEnrichment(kv, url, enrichment);

    console.log(`[api/news/summarize] Processed and cached: ${url}`);

    return Response.json({
      success: true,
      data: { ...enrichment, url },
      cached: false,
      timestamp: new Date().toISOString(),
    } as SummarizeResponse);

  } catch (error: any) {
    console.error('[api/news/summarize] Error:', error);

    return Response.json({
      success: false,
      error: error.message || 'Processing failed',
      timestamp: new Date().toISOString(),
    } as SummarizeResponse, { status: 500 });
  }
}

/**
 * OPTIONS handler for CORS with origin whitelist
 */
export async function OPTIONS({ request }: { request: Request }) {
  const origin = request.headers.get('origin');

  // 允许的源列表 (环境变量配置)
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'https://my-tools-bim.pages.dev')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const isAllowed = origin && allowedOrigins.includes(origin);

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // 24 hours
  };

  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }

  return new Response(null, { status: 204, headers });
}
