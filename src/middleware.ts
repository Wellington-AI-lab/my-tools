import type { MiddlewareHandler } from 'astro';
import { decodeSession } from '@/lib/session';
import { getEnv } from '@/lib/env';

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
];

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('/_astro')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (pathname.startsWith('/robots')) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { pathname } = context.url;
  if (isPublicPath(pathname)) return next();

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

