/**
 * Cleanup endpoint for old trends reports
 * Call this from a Cron job (e.g., daily) to delete reports older than retention days
 */

import type { APIRoute } from 'astro';
import { getEnv, getD1 } from '@/lib/env';
import { deleteOldReports } from '@/modules/trends/store';

const AUTH_HEADER = 'X-Cron-Auth';

export const POST: APIRoute = async (context) => {
  const authHeader = context.request.headers.get(AUTH_HEADER);
  const env = getEnv(context.locals) as any;
  const cronSecret = env.CRON_SECRET;

  if (authHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const d1 = getD1(context.locals);
  if (!d1) {
    return new Response(JSON.stringify({ error: 'D1 database not available' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    // Get retention days from query param, default to 14
    const retentionRaw = context.url.searchParams.get('retentionDays');
    const retentionDays = retentionRaw ? Number(retentionRaw) : 14;

    const result = await deleteOldReports(d1, retentionDays);

    return Response.json({
      success: true,
      deletedCount: result.count,
      retentionDays,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[cleanup] Error:', error);
    return Response.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
};

export const GET = POST; // Allow GET for simplicity with cron services
