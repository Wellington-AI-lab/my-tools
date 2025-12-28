import type { APIRoute } from 'astro';
import { getD1, getKV } from '@/lib/env';
import { getLatestTrendsReport } from '@/modules/trends/store';

export const GET: APIRoute = async (context) => {
  try {
    const d1 = getD1(context.locals);
    if (!d1) {
      return new Response(JSON.stringify({ error: 'D1 database not available' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }

    const kv = getKV(context.locals);
    const report = await getLatestTrendsReport(d1, kv);
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


