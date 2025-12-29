import type { APIRoute } from 'astro';
import { decodeSession } from '@/lib/session';
import { getSessionSecret } from '@/lib/auth';

export const GET: APIRoute = async (context) => {
  const token = context.cookies.get('auth_session')?.value ?? null;
  const signed = context.cookies.get('auth_session_data')?.value ?? null;

  const result = {
    hasToken: !!token,
    hasSigned: !!signed,
    tokenPreview: token ? `${token.substring(0, 8)}...` : null,
    signedPreview: signed ? `${signed.substring(0, 20)}...` : null,
    decodeResult: null as { success: boolean; payload?: any; error?: string },
  };

  if (signed) {
    try {
      const secret = getSessionSecret(process.env);
      const payload = await decodeSession(signed, secret);
      result.decodeResult = {
        success: !!payload,
        payload: payload ? { role: payload.role, expiresAt: payload.expiresAt } : null,
      };
    } catch (err: any) {
      result.decodeResult = {
        success: false,
        error: err?.message || 'Unknown error',
      };
    }
  }

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
