import type { AstroCookies } from 'astro';
import { encodeSession } from '@/lib/session';
import { randomHex, verifyPasswordPbkdf2 } from '@/lib/crypto';

export type UserRole = 'user' | 'admin';

export function getSessionSecret(env: { SESSION_SECRET?: string }): string {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
}

export function getStoredPasswordHash(env: { SITE_PASSWORD_HASH?: string }): string {
  const v = env.SITE_PASSWORD_HASH;
  if (!v) throw new Error('SITE_PASSWORD_HASH is not set');
  return v;
}

export function getAdminPasswordHash(env: { ADMIN_PASSWORD_HASH?: string }): string {
  const v = env.ADMIN_PASSWORD_HASH;
  if (!v) throw new Error('ADMIN_PASSWORD_HASH is not set');
  return v;
}

export async function verifyPassword(inputPassword: string, storedPasswordHash: string): Promise<boolean> {
  return verifyPasswordPbkdf2(inputPassword, storedPasswordHash);
}

export async function createSessionCookies(opts: {
  cookies: AstroCookies;
  env: { SESSION_SECRET?: string };
  role: UserRole;
  secure?: boolean;
}): Promise<void> {
  const { cookies, env, role } = opts;
  const sessionToken = randomHex(32);

  const expiresAt = new Date();
  expiresAt.setHours(23, 59, 59, 999);
  const maxAgeSeconds = Math.max(
    60 * 60,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  );

  const signed = await encodeSession(
    { token: sessionToken, expiresAt: expiresAt.toISOString(), role },
    getSessionSecret(env)
  );

  const secure =
    typeof opts.secure === 'boolean'
      ? opts.secure
      : (env as any).NODE_ENV === 'production' || process.env.NODE_ENV === 'production';

  cookies.set('auth_session', sessionToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });

  cookies.set('auth_session_data', signed, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookies(cookies: AstroCookies) {
  cookies.delete('auth_session', { path: '/' });
  cookies.delete('auth_session_data', { path: '/' });
}

