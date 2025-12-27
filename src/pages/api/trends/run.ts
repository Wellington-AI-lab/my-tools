import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getEnv, requireKV } from '@/lib/env';
import { runTrendsAgent } from '@/modules/trends/agent';
import { putTrendsReport } from '@/modules/trends/store';

const schema = z.object({
  minScore: z.number().finite().min(0).max(100000).optional(),
  dedupSimilarity: z.number().finite().min(0).max(1).optional(),
});

// Manual trigger (auth-required via middleware): run and store the latest report.
export const POST: APIRoute = async (context) => {
  try {
    const parsed = schema.safeParse(await context.request.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const kv = requireKV(context.locals);
    const env = getEnv(context.locals) as any;
    const report = await runTrendsAgent({
      env: {
        LLM_BASE_URL: env.LLM_BASE_URL ?? process.env.LLM_BASE_URL,
        LLM_API_KEY: env.LLM_API_KEY ?? process.env.LLM_API_KEY,
        LLM_MODEL: env.LLM_MODEL ?? process.env.LLM_MODEL,
      },
      minScore: parsed.data.minScore,
      dedupSimilarity: parsed.data.dedupSimilarity,
    });
    await putTrendsReport(kv, report);

    return new Response(JSON.stringify(report), {
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


