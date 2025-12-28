/**
 * Dropped Tags Analysis API
 * 用于监控和分析被丢弃的标签，指导 TAG_ALIAS_MAP 迭代
 */

import { requireD1 } from '@/lib/env';

export const prerender = false;

interface DroppedTag {
  id: number;
  original_tag: string;
  normalized_tag: string;
  reason: string;
  created_at: string;
  scan_id?: string;
}

interface StatsResponse {
  total: number;
  byReason: Record<string, number>;
  topDropped: Array<{ tag: string; count: number }>;
  recent: DroppedTag[];
}

export async function GET({ locals, url }: {
  locals: App.Locals;
  url: URL;
}) {
  const d1 = requireD1(locals);

  const limit = parseInt(url.searchParams.get('limit') || '50');
  const groupBy = url.searchParams.get('group') === 'true';

  try {
    // 获取统计信息
    const statsResult = await d1.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT original_tag) as unique_tags,
        COUNT(CASE WHEN reason = 'NOT_IN_WHITELIST' THEN 1 END) as not_in_whitelist,
        COUNT(CASE WHEN reason = 'EMPTY' THEN 1 END) as empty,
        COUNT(CASE WHEN reason = 'DUPLICATE' THEN 1 END) as duplicate
      FROM dropped_tags
    `).first<{ total: number; unique_tags: number; not_in_whitelist: number; empty: number; duplicate: number }>();

    // 获取被丢弃最多的标签
    const topDroppedResult = await d1.prepare(`
      SELECT original_tag, COUNT(*) as count
      FROM dropped_tags
      GROUP BY original_tag
      ORDER BY count DESC
      LIMIT 20
    `).all<{ original_tag: string; count: number }>();

    // 获取最近的记录
    const recentResult = await d1.prepare(`
      SELECT id, original_tag, normalized_tag, reason, created_at, scan_id
      FROM dropped_tags
      ORDER BY id DESC
      LIMIT ?
    `).bind(limit).all<DroppedTag>();

    const response: StatsResponse = {
      total: statsResult?.total || 0,
      byReason: {
        NOT_IN_WHITELIST: statsResult?.not_in_whitelist || 0,
        EMPTY: statsResult?.empty || 0,
        DUPLICATE: statsResult?.duplicate || 0,
      },
      topDropped: topDroppedResult.results || [],
      recent: recentResult.results || [],
    };

    return Response.json(response);

  } catch (error: any) {
    console.error('[trends/dropped-tags] Error:', error);
    return Response.json({
      error: error.message,
      total: 0,
      byReason: {},
      topDropped: [],
      recent: [],
    } as Partial<StatsResponse>, { status: 500 });
  }
}

/**
 * DELETE /api/trends/dropped-tags?clear=all
 * 清理 dropped_tags 表（用于维护）
 */
export async function DELETE({ locals, url }: {
  locals: App.Locals;
  url: URL;
}) {
  const d1 = requireD1(locals);
  const clear = url.searchParams.get('clear');

  if (clear !== 'all') {
    return Response.json({ error: 'Missing ?clear=all parameter' }, { status: 400 });
  }

  try {
    const result = await d1.prepare(`DELETE FROM dropped_tags`).run();

    return Response.json({
      success: true,
      deleted: result.meta?.changes || 0,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
