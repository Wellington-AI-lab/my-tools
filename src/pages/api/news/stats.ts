/**
 * News Stats API - 统计信息端点
 *
 * GET /api/news/stats
 *
 * 返回新闻流的统计信息，包括来源分布、总数等
 */

import { requireKV } from '@/lib/env';
import { getSourceStats } from '@/modules/news/repository';

interface StatsResponse {
  success: boolean;
  totalArticles: number;
  bySource: Array<{ source: string; count: number }>;
  timestamp: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  timestamp: string;
}

export async function GET({ locals }: {
  locals: App.Locals;
}) {
  const kv = requireKV(locals);

  try {
    const stats = await getSourceStats(kv);

    const bySource = Object.entries(stats)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    const totalArticles = Object.values(stats).reduce((sum, count) => sum + count, 0);

    return Response.json({
      success: true,
      totalArticles,
      bySource,
      timestamp: new Date().toISOString(),
    } as StatsResponse);
  } catch (error: any) {
    console.error('[api/news/stats] Error:', error);

    const errorResponse: ErrorResponse = {
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    };

    return Response.json(errorResponse, { status: 500 });
  }
}
