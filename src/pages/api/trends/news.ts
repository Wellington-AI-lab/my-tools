/**
 * Query tag-related historical news with time range filter
 *
 * Query parameters:
 * - tag: (required) Tag name to search for
 * - limit: (optional) Maximum number of results, default 50, max 500
 * - hours: (optional) Query news from last N hours
 * - days: (optional) Query news from last N days
 *
 * If neither hours nor days is specified, returns all historical news
 */

import { requireD1 } from '@/lib/env';
import { queryNewsByTag } from '@/modules/trends/db/news';

export async function GET({ locals, url }: { locals: App.Locals; url: URL }) {
  const d1 = requireD1(locals);
  const tag = url.searchParams.get('tag');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
  const hours = parseInt(url.searchParams.get('hours') || '0');
  const days = parseInt(url.searchParams.get('days') || '0');

  if (!tag) {
    return Response.json({
      success: false,
      error: 'Missing required parameter: tag',
      data: null,
    }, { status: 400 });
  }

  try {
    // Calculate time range
    let startTime: string | undefined;
    let endTime: string | undefined;
    const now = new Date().toISOString();

    if (hours > 0) {
      startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    } else if (days > 0) {
      startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    }
    endTime = now;

    const result = await queryNewsByTag(d1, tag, limit, { startTime, endTime });

    console.log(`[trends/news] Found ${result.count} news items for tag "${tag}"` +
                (hours ? ` (last ${hours}h)` : days ? ` (last ${days}d)` : ''));

    return Response.json({
      success: true,
      tag,
      count: result.count,
      items: result.items,
      period: startTime ? { start: startTime, end: endTime } : undefined,
    });

  } catch (error: any) {
    console.error('[trends/news] Query error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Query failed',
      tag,
      items: [],
    }, { status: 500 });
  }
}
