/**
 * Query tag-related historical news
 * Uses the refactored database layer
 */

import { requireD1 } from '@/lib/env';
import { queryNewsByTag } from '@/modules/trends/db/news';

export async function GET({ locals, url }: { locals: App.Locals; url: URL }) {
  const d1 = requireD1(locals);
  const tag = url.searchParams.get('tag');
  const limit = parseInt(url.searchParams.get('limit') || '10');

  if (!tag) {
    return Response.json({
      success: false,
      error: 'Missing required parameter: tag',
      data: null,
    }, { status: 400 });
  }

  try {
    const result = await queryNewsByTag(d1, tag, limit);

    console.log(`[trends/news] Found ${result.count} news items for tag "${tag}"`);

    return Response.json({
      success: true,
      tag,
      count: result.count,
      items: result.items,
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
