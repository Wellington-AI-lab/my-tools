import type { APIRoute } from 'astro';
import { encodeSession } from '@/lib/session';
import { verifyPasswordPbkdf2 } from '@/lib/crypto';

export const POST: APIRoute = async (context) => {
  // Get form data
  const formData = await context.request.formData();
  const password = formData.get('password') as string;
  const redirect = formData.get('redirect') as string || '/';

  if (!password) {
    return context.redirect('/login?error=missing_password');
  }

  // Verify password
  const sitePasswordHash = process.env.SITE_PASSWORD_HASH || '';
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || '';

  const isSiteValid = sitePasswordHash ? await verifyPasswordPbkdf2(password, sitePasswordHash) : false;
  const isAdminValid = adminPasswordHash ? await verifyPasswordPbkdf2(password, adminPasswordHash) : false;

  if (!isSiteValid && !isAdminValid) {
    return context.redirect('/login?error=invalid_password');
  }

  // Create session
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(23, 59, 59, 999);

  const role = isAdminValid ? 'admin' : 'user';
  const sessionSecret = process.env.SESSION_SECRET || '';

  if (!sessionSecret) {
    console.error('SESSION_SECRET not set');
    return context.redirect('/login?error=config');
  }

  const signed = await encodeSession(
    { token: sessionToken, expiresAt: expiresAt.toISOString(), role },
    sessionSecret
  );

  // Set cookies with maximum compatibility
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

  context.cookies.set('auth_session', sessionToken, {
    httpOnly: false, // Allow JavaScript access for debugging
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  context.cookies.set('auth_session_data', signed, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  // Redirect to target page
  return context.redirect(redirect);
};
