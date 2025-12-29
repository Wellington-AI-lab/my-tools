import type { APIRoute } from 'astro';
import { decodeSession } from '@/lib/session';
import { getSessionSecret } from '@/lib/auth';

type DecodeResult = { success: true; payload?: { role: string; expiresAt: string } } | { success: false; error?: string };

export const GET: APIRoute = async (context) => {
  const token = context.cookies.get('auth_session')?.value ?? null;
  const signed = context.cookies.get('auth_session_data')?.value ?? null;

  const result = {
    hasToken: !!token,
    hasSigned: !!signed,
    tokenPreview: token ? `${token.substring(0, 8)}...` : null,
    signedPreview: signed ? `${signed.substring(0, 20)}...` : null,
    decodeResult: null as DecodeResult | null,
  };

  if (signed) {
    try {
      const secret = getSessionSecret(process.env as Record<string, string | undefined>);
      const payload = await decodeSession(signed, secret);
      result.decodeResult = {
        success: true,
        payload: payload ? { role: payload.role, expiresAt: payload.expiresAt } : undefined,
      };
    } catch (err) {
      result.decodeResult = {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
