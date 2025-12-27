import type { APIRoute } from 'astro';
import { clearSessionCookies } from '@/lib/auth';

export const POST: APIRoute = async (context) => {
  clearSessionCookies(context.cookies);
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};


