import type { MiddlewareHandler } from 'astro';
import { decodeSession } from '@/lib/session';
import { getEnv } from '@/lib/env';

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
];

// API 路径允许使用 X-Admin-Key 认证（用于 Cron/自动化）
const API_KEY_AUTH_PATHS = [
  '/api/trends/run',
  '/api/news/run',
];

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('/_astro')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (pathname.startsWith('/robots')) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function allowsApiKeyAuth(pathname: string): boolean {
  return API_KEY_AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { pathname } = context.url;
  if (isPublicPath(pathname)) return next();

  // 确保 locals 存在
  if (!context.locals) {
    context.locals = {} as any;
  }

  // 开发环境跳过登录验证
  if (process.env.NODE_ENV === 'development') {
    context.locals.user = { role: 'user' };
    return next();
  }

  // 如果是允许 API Key 认证的路径，且带有 X-Admin-Key header，则放行（由 API 自行验证）
  if (allowsApiKeyAuth(pathname) && context.request.headers.has('X-Admin-Key')) {
    return next();
  }

  const token = context.cookies.get('auth_session')?.value ?? null;
  const signed = context.cookies.get('auth_session_data')?.value ?? null;
  if (!token || !signed) {
    return context.redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  const env = getEnv(context.locals) as { SESSION_SECRET?: string };
  const secret = env.SESSION_SECRET ?? process.env.SESSION_SECRET;
  if (!secret) return context.redirect(`/login?redirect=${encodeURIComponent(pathname)}`);

  const payload = await decodeSession(signed, secret);
  if (!payload) return context.redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  if (payload.token !== token) return context.redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) {
    return context.redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  context.locals.user = { role: payload.role };
  return next();
};

