import type { APIRoute } from 'astro';
import { requireKV } from '@/lib/env';
import { getLatestTrendsReport } from '@/modules/trends/store';

export const GET: APIRoute = async (context) => {
  try {
    const kv = requireKV(context.locals);
    const report = await getLatestTrendsReport(kv);
    if (!report) {
      return new Response(JSON.stringify({ error: 'No trends report yet. Wait for cron or trigger a run.' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(report), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};


