import type { APIRoute } from 'astro';
import { requireKV } from '@/lib/env';
import { getTrendsHistory } from '@/modules/trends/store';

export const GET: APIRoute = async (context) => {
  try {
    const kv = requireKV(context.locals);
    const limitRaw = context.url.searchParams.get('limit');
    const limit = limitRaw ? Number(limitRaw) : 7;
    const history = await getTrendsHistory(kv, Number.isFinite(limit) ? limit : 7);
    return new Response(JSON.stringify({ items: history }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};


