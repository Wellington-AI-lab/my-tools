import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import {
  createSessionCookies,
  getAdminPasswordHash,
  getStoredPasswordHash,
  verifyPassword,
} from '@/lib/auth';
import { getClientIp } from '@/lib/request';
import { bumpDailyCounter, clearDailyCounter } from '@/lib/rate-limit';

const bodySchema = z.object({
  password: z.string().min(1),
});

const MAX_DAILY_FAILS_PER_IP = 30;

export const POST: APIRoute = async (context) => {
  try {
    const env = getEnv(context.locals) as any;
    const ip = getClientIp(context.request);

    const body = bodySchema.safeParse(await context.request.json().catch(() => ({})));
    if (!body.success) {
      return new Response(JSON.stringify({ error: '密码不能为空' }), { status: 400 });
    }

    // Basic brute-force guard (KV-backed)
    const failKeyId = ip || 'unknown';

    const storedUserHash = getStoredPasswordHash(env);
    
    // 管理员密码哈希可能未设置，优雅处理
    let storedAdminHash: string | null = null;
    try {
      storedAdminHash = getAdminPasswordHash(env);
    } catch {
      // ADMIN_PASSWORD_HASH 未设置，忽略管理员登录
      storedAdminHash = null;
    }

    const isAdmin = storedAdminHash ? await verifyPassword(body.data.password, storedAdminHash) : false;
    const isUser = await verifyPassword(body.data.password, storedUserHash);

    if (!isAdmin && !isUser) {
      const limitResult = await bumpDailyCounter({
        locals: context.locals,
        keyPrefix: 'auth:fail',
        id: failKeyId,
        limit: MAX_DAILY_FAILS_PER_IP,
      });

      const msg = limitResult.allowed
        ? `密码错误（今日剩余 ${limitResult.remaining} 次）`
        : '登录失败次数过多，今日已锁定。';

      return new Response(JSON.stringify({ error: msg, remaining: limitResult.remaining }), {
        status: limitResult.allowed ? 401 : 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Success: clear fail counter for this IP (best-effort)
    await clearDailyCounter({ locals: context.locals, keyPrefix: 'auth:fail', id: failKeyId });

    await createSessionCookies({
      cookies: context.cookies,
      env,
      role: isAdmin ? 'admin' : 'user',
      secure: context.url.protocol === 'https:',
    });

    return new Response(JSON.stringify({ success: true, role: isAdmin ? 'admin' : 'user' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Login error:', errorMessage, err);
    return new Response(
      JSON.stringify({
        error: '登录失败',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
};


