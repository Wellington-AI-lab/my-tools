import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { runRednoteAgent } from '@/modules/in-depth-analysis/agent';

const schema = z.object({
  keyword: z.string().trim().min(1).max(80),
  timeRange: z.enum(['24h', '7d', '30d']),
  heatThreshold: z.number().finite().min(0).max(100000).optional(),
  topK: z.number().finite().int().min(1).max(60).optional(),
});

// Vercel Serverless 限制 60s，留 5s 余量
const HANDLER_TIMEOUT_MS = 55000;

export const POST: APIRoute = async (context) => {
  // 超时控制
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Request processing timeout')), HANDLER_TIMEOUT_MS);
  });

  try {
    // Validate content-type before parsing JSON
    const contentType = context.request.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Invalid content type' }), {
        status: 415,
        headers: { 'content-type': 'application/json' },
      });
    }

    const parsed = schema.safeParse(await context.request.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // 使用 Promise.race 添加超时控制
    const res = await Promise.race([
      (async () => {
        const env = getEnv(context.locals) as any;
        return await runRednoteAgent({
          env: {
            LLM_BASE_URL: env.LLM_BASE_URL,
            LLM_API_KEY: env.LLM_API_KEY,
            LLM_MODEL: env.LLM_MODEL,
            APIFY_TOKEN: env.APIFY_TOKEN,
          },
          req: {
            keyword: parsed.data.keyword,
            timeRange: parsed.data.timeRange,
            heatThreshold: parsed.data.heatThreshold,
            topK: parsed.data.topK,
          },
        });
      })(),
      timeoutPromise,
    ]);

    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.includes('timeout');
    return new Response(JSON.stringify({
      error: isTimeout
        ? 'Processing timeout - please try with narrower parameters'
        : String(err)
    }), {
      status: isTimeout ? 504 : 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};


