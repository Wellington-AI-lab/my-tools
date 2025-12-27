import type { APIRoute } from 'astro';
import { getEnv, requireKV } from '@/lib/env';
import { runNewsAgent } from '@/modules/news/agent';
import { putNewsReport } from '@/modules/news/store';

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

// 手动/Cron 触发信息流抓取
export const POST: APIRoute = async (context) => {
  const env = getEnv(context.locals) as any;

  // 验证 X-Admin-Key（如果有）
  const hasAdminKey = context.request.headers.has('X-Admin-Key');
  if (hasAdminKey && !verifyAdminKey(context.request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: invalid admin key' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const kv = requireKV(context.locals);

    // 获取 Cloudflare AI binding（如果有）
    const ai = env.AI as { run: (model: string, input: unknown) => Promise<unknown> } | undefined;

    const report = await runNewsAgent({ kv, ai });
    await putNewsReport(kv, report);

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
