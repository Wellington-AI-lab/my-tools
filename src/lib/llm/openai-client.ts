/**
 * OpenAI-Compatible LLM Client
 *
 * Shared LLM client for all modules.
 * Supports any OpenAI-compatible API (GLM, Anthropic, OpenAI, etc.)
 */

export type OpenAIChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string };

export async function openAICompatibleChatCompletion(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const base = String(opts.baseUrl || '').trim().replace(/\/+$/g, '');
  if (!base) throw new Error('LLM_BASE_URL is missing');
  if (!opts.apiKey) throw new Error('LLM_API_KEY is missing');
  if (!opts.model) throw new Error('LLM_MODEL is missing');

  const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, opts.timeoutMs ?? 20000));

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.3,
        max_tokens: typeof opts.maxTokens === 'number' ? opts.maxTokens : 900,
      }),
      signal: controller.signal,
    });

    const data = await resp.json().catch(() => ({} as any));
    if (!resp.ok) {
      const msg =
        (data && (data.error?.message || data.message)) ||
        `LLM HTTP ${resp.status}`;
      throw new Error(msg);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') throw new Error('LLM response missing content');
    return content;
  } finally {
    clearTimeout(timeout);
  }
}
