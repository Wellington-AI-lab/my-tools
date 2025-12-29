import type { MiddlewareHandler } from 'astro';

// 公开路径 - 不需要认证
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/debug',
  '/tools/news', // 新闻页面公开
];

function isPublicPath(pathname: string): boolean {
  // 静态资源
  if (pathname.startsWith('/_astro')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (pathname.startsWith('/robots')) return true;

  // 公开路径
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const pathname = new URL(context.request.url).pathname;

  // 公开路径直接放行
  if (isPublicPath(pathname)) {
    return next();
  }

  // 确保 locals 存在
  if (!context.locals) {
    context.locals = {} as any;
  }

  // 检查 Cookie
  const token = context.cookies.get('auth_session')?.value ?? null;
  const signed = context.cookies.get('auth_session_data')?.value ?? null;

  // 没有 session，重定向到登录
  if (!token || !signed) {
    return context.redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  // 验证 session
  try {
    const { decodeSession } = await import('@/lib/session');
    const { getSessionSecret } = await import('@/lib/auth');
    const secret = getSessionSecret(process.env as Record<string, string | undefined>);
    const payload = await decodeSession(signed, secret);

    if (!payload || payload.token !== token) {
      return context.redirect('/login?redirect=' + encodeURIComponent(pathname));
    }

    // 检查过期
    if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) {
      return context.redirect('/login?redirect=' + encodeURIComponent(pathname));
    }

    // 设置用户信息
    context.locals.user = { role: payload.role };
    return next();
  } catch (error) {
    console.error('Middleware error:', error);
    return context.redirect('/login?error=invalid');
  }
};

