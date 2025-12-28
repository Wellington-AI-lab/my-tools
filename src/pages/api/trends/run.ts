import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getEnv, getD1, getKV } from '@/lib/env';
import { runTrendsAgent } from '@/modules/trends/agent';
import { putTrendsReport } from '@/modules/trends/store';

const schema = z.object({
  minScore: z.number().finite().min(0).max(100000).optional(),
  dedupSimilarity: z.number().finite().min(0).max(1).optional(),
});

/**
 * 验证 API 密钥（用于 Cron/自动化触发）
 */
function verifyAdminKey(request: Request, env: any): boolean {
  const adminKey = request.headers.get('X-Admin-Key');
  if (!adminKey) return false;

  const expectedKey = env.ADMIN_KEY ?? process.env.ADMIN_KEY;
  if (!expectedKey) return false;

  if (adminKey.length !== expectedKey.length) return false;
  let result = 0;
  for (let i = 0; i < adminKey.length; i++) {
    result |= adminKey.charCodeAt(i) ^ expectedKey.charCodeAt(i);
  }
  return result === 0;
}

export const POST: APIRoute = async (context) => {
  const env = getEnv(context.locals) as any;

  if (context.request.headers.has('X-Admin-Key') && !verifyAdminKey(context.request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: invalid admin key' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const parsed = schema.safeParse(await context.request.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const d1 = getD1(context.locals);
    if (!d1) {
      return new Response(JSON.stringify({ error: 'D1 database not available' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }

    const kv = getKV(context.locals);
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

    // New signature: putTrendsReport(d1, report, kv?)
    await putTrendsReport(d1, report, kv);

    return new Response(JSON.stringify(report), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};


