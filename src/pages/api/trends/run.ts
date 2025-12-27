import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getEnv, requireKV } from '@/lib/env';
import { runTrendsAgent } from '@/modules/trends/agent';
import { putTrendsReport } from '@/modules/trends/store';

const schema = z.object({
  minScore: z.number().finite().min(0).max(100000).optional(),
  dedupSimilarity: z.number().finite().min(0).max(1).optional(),
});

/**
 * 验证 API 密钥（用于 Cron/自动化触发）
 * 如果请求带有 X-Admin-Key header，则验证密钥而不是 session
 */
function verifyAdminKey(request: Request, env: any): boolean {
  const adminKey = request.headers.get('X-Admin-Key');
  if (!adminKey) return false;

  const expectedKey = env.ADMIN_KEY ?? process.env.ADMIN_KEY;
  if (!expectedKey) return false;

  // 使用常量时间比较防止时序攻击
  if (adminKey.length !== expectedKey.length) return false;
  let result = 0;
  for (let i = 0; i < adminKey.length; i++) {
    result |= adminKey.charCodeAt(i) ^ expectedKey.charCodeAt(i);
  }
  return result === 0;
}

// Manual trigger (auth-required via middleware) or automated trigger (X-Admin-Key)
export const POST: APIRoute = async (context) => {
  const env = getEnv(context.locals) as any;

  // 如果带有 X-Admin-Key，验证密钥（绕过 session 认证）
  const hasAdminKey = context.request.headers.has('X-Admin-Key');
  if (hasAdminKey && !verifyAdminKey(context.request, env)) {
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


