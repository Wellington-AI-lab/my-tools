import type { APIRoute } from 'astro';
import { getEnv } from '@/lib/env';
import { getStoredPasswordHash } from '@/lib/auth';

export const GET: APIRoute = async (context) => {
  // Check what environment variables are available directly
  const directEnv = {
    SESSION_SECRET: typeof process.env.SESSION_SECRET,
    SITE_PASSWORD_HASH: typeof process.env.SITE_PASSWORD_HASH,
    ADMIN_PASSWORD_HASH: typeof process.env.ADMIN_PASSWORD_HASH,
  };

  // Check what getEnv returns
  const env = getEnv(context.locals);
  const envFromGetEnv: {
    hasSessionSecret: boolean;
    hasPasswordHash: boolean;
    hasAdminHash: boolean;
    passwordHashPrefix: string;
    storedHashPrefix?: string;
    error?: string;
  } = {
    hasSessionSecret: !!env.SESSION_SECRET,
    hasPasswordHash: !!env.SITE_PASSWORD_HASH,
    hasAdminHash: !!env.ADMIN_PASSWORD_HASH,
    passwordHashPrefix: (env.SITE_PASSWORD_HASH as string || '').substring(0, 20),
  };

  // Try to get password hash through the function
  try {
    const storedHash = getStoredPasswordHash(env);
    envFromGetEnv.storedHashPrefix = storedHash.substring(0, 20);
  } catch (e) {
    envFromGetEnv.error = e instanceof Error ? e.message : 'Unknown error';
  }

  return new Response(JSON.stringify({
    directEnv,
    envFromGetEnv,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
