/**
 * Cloudflare Worker - Scheduled Cleanup Job
 * Runs daily at 2 AM UTC to delete old trends reports
 */

interface Env {
  TRENDS_DB: D1Database;
  CLEANUP_API_URL?: string;
  CRON_SECRET?: string;
  RETENTION_DAYS?: string;
}

// SQL to delete old reports
const SQL_DELETE_OLD = `
  DELETE FROM trend_reports
  WHERE created_at < datetime('now', '-' || ? || ' days')
`;

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const retentionDays = Number(env.RETENTION_DAYS || '14');

    try {
      // Direct D1 cleanup (faster, no HTTP overhead)
      const result = await env.TRENDS_DB.prepare(SQL_DELETE_OLD)
        .bind(retentionDays)
        .run();

      console.log(`[cleanup] Deleted ${result.meta.changes || 0} old reports (retention: ${retentionDays} days)`);

      // Optional: Call cleanup API for additional logging/monitoring
      if (env.CLEANUP_API_URL && env.CRON_SECRET) {
        await fetch(env.CLEANUP_API_URL, {
          method: 'POST',
          headers: { 'X-Cron-Auth': env.CRON_SECRET },
        }).catch(err => console.error('[cleanup] API call failed:', err));
      }
    } catch (error: any) {
      console.error('[cleanup] Error:', error.message);
      throw error;
    }
  },

  // Health check endpoint
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      const retentionDays = Number(env.RETENTION_DAYS || '14');
      const countResult = await env.TRENDS_DB.prepare(
        'SELECT COUNT(*) as count FROM trend_reports'
      ).first<{ count: number }>();

      return Response.json({
        status: 'ok',
        retentionDays,
        currentReports: countResult?.count || 0,
      });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
