import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { runRednoteAgent } from '@/modules/rednote/agent';

const schema = z.object({
  keyword: z.string().trim().min(1).max(80),
  timeRange: z.enum(['24h', '7d', '30d']),
  heatThreshold: z.number().finite().min(0).max(100000).optional(),
  topK: z.number().finite().int().min(1).max(60).optional(),
});

export const POST: APIRoute = async (context) => {
  try {
    const parsed = schema.safeParse(await context.request.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const env = getEnv(context.locals) as any;
    const res = await runRednoteAgent({
      env: {
        LLM_BASE_URL: env.LLM_BASE_URL ?? process.env.LLM_BASE_URL,
        LLM_API_KEY: env.LLM_API_KEY ?? process.env.LLM_API_KEY,
        LLM_MODEL: env.LLM_MODEL ?? process.env.LLM_MODEL,
        APIFY_TOKEN: env.APIFY_TOKEN ?? process.env.APIFY_TOKEN,
      },
      req: {
        keyword: parsed.data.keyword,
        timeRange: parsed.data.timeRange,
        heatThreshold: parsed.data.heatThreshold,
        topK: parsed.data.topK,
      },
    });

    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};


