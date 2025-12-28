/**
 * 历史趋势分析 API
 * 查询标签的历史变化、速度、加速度等
 */

import { requireD1 } from '@/lib/env';

interface HistoryQuery {
  tag?: string;      // 查询特定标签
  days?: number;     // 查询天数
  hours?: number;    // 查询小时数
  limit?: number;    // 返回数量限制
}

interface RealtimeItem {
  tag: string;
  totalCount: number;
  avgCount: number;
  appearanceCount: number;
}

interface TagSnapshot {
  scan_time: string;
  tag: string;
  count: number;
  rank: number;
  period: string;
}

interface TrendPoint {
  time: string;
  count: number;
  rank: number;
}

interface TagHistory {
  tag: string;
  data: TrendPoint[];
  currentCount: number;
  currentRank: number;
  velocity: number;        // 速度：最近周期变化量
  acceleration: number;    // 加速度：速度变化
  trend: 'up' | 'down' | 'stable';
}

interface VelocityItem {
  tag: string;
  currentCount: number;
  previousCount: number;
  velocity: number;
  percentChange: number;
  trend: 'up' | 'down' | 'stable';
}

/**
 * 获取标签历史数据
 * GET /api/trends/history?tag=AI&days=7
 * GET /api/trends/history?mode=velocity&hours=24  (增长最快)
 * GET /api/trends/history?mode=persistent&days=7   (持续热点)
 * GET /api/trends/history?mode=top&days=7         (时段Top)
 * GET /api/trends/history?mode=realtime&hours=8   (实时热搜聚合)
 */
export async function GET({ locals, url }: { locals: App.Locals; url: URL }) {
  const d1 = requireD1(locals);
  const tag = url.searchParams.get('tag');
  const days = parseInt(url.searchParams.get('days') || '7');
  const hours = parseInt(url.searchParams.get('hours') || '0');
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const mode = url.searchParams.get('mode') || 'tag'; // tag | velocity | persistent | top | realtime

  try {
    const startTime = hours > 0
      ? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    if (mode === 'velocity') {
      // 返回增长最快的标签（速度分析）
      return await getVelocityAnalysis(d1, startTime, limit);
    } else if (mode === 'persistent') {
      // 返回持续热点（长期保持高位的标签）
      return await getPersistentTags(d1, startTime, limit);
    } else if (mode === 'top') {
      // 返回指定时间段的Top标签
      return await getTopTags(d1, startTime, limit);
    } else if (mode === 'realtime') {
      // 返回实时热搜聚合（最近N小时的总热度）
      return await getRealtimeTags(d1, startTime, limit);
    } else if (tag) {
      // 返回特定标签的历史数据
      return await getTagHistory(d1, tag, startTime, limit);
    } else {
      // 默认返回所有标签的最新状态
      return await getLatestTags(d1, limit);
    }
  } catch (error: any) {
    console.error('[trends/history] Error:', error);
    return Response.json({
      error: error.message || 'Failed to fetch history',
      data: null
    }, { status: 500 });
  }
}

/**
 * 获取特定标签的历史趋势
 */
async function getTagHistory(d1: D1Database, tag: string, startTime: string, limit: number) {
  const stmt = d1.prepare(`
    SELECT scan_time, tag, count, rank, period
    FROM tag_snapshots
    WHERE tag = ? AND scan_time >= ?
    ORDER BY scan_time DESC
    LIMIT ?
  `);

  const result = await stmt.bind(tag, startTime, limit).all<TagSnapshot>();
  const snapshots = result.results || [];

  if (snapshots.length === 0) {
    return Response.json({
      tag,
      data: [],
      currentCount: 0,
      currentRank: 0,
      velocity: 0,
      acceleration: 0,
      trend: 'stable' as const
    });
  }

  // 按时间升序排列
  const data = snapshots.reverse().map(s => ({
    time: s.scan_time,
    count: s.count,
    rank: s.rank
  }));

  // 计算速度和加速度
  const velocity = data.length >= 2
    ? data[data.length - 1].count - data[data.length - 2].count
    : 0;

  const acceleration = data.length >= 3
    ? (data[data.length - 1].count - data[data.length - 2].count) -
      (data[data.length - 2].count - data[data.length - 3].count)
    : 0;

  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (velocity > 2) trend = 'up';
  else if (velocity < -2) trend = 'down';

  const latest = snapshots[0];

  return Response.json({
    tag,
    data,
    currentCount: latest.count,
    currentRank: latest.rank,
    velocity,
    acceleration,
    trend
  });
}

/**
 * 获取速度分析：增长最快的标签
 */
async function getVelocityAnalysis(d1: D1Database, startTime: string, limit: number) {
  // 获取两个时间点的数据进行对比
  const midTime = new Date(Date.now() - (Date.now() - new Date(startTime).getTime()) / 2).toISOString();

  // 获取最新和最早的数据对比
  const comparisonStmt = d1.prepare(`
    SELECT
      tag,
      SUM(CASE WHEN scan_time >= ? THEN count ELSE 0 END) as recent_count,
      SUM(CASE WHEN scan_time < ? THEN count ELSE 0 END) as previous_count
    FROM tag_snapshots
    WHERE scan_time >= ?
    GROUP BY tag
    HAVING recent_count > 0 AND previous_count > 0
    ORDER BY (recent_count - previous_count) DESC
    LIMIT ?
  `);

  const result = await comparisonStmt.bind(midTime, midTime, startTime, limit).all();

  const items: VelocityItem[] = (result.results || []).map((row: any) => {
    const recentCount = row.recent_count || 0;
    const previousCount = row.previous_count || 0;
    const velocity = recentCount - previousCount;
    const percentChange = previousCount > 0 ? (velocity / previousCount) * 100 : 100;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (velocity > 5) trend = 'up';
    else if (velocity < -5) trend = 'down';

    return {
      tag: row.tag,
      currentCount: recentCount,
      previousCount,
      velocity,
      percentChange: Math.round(percentChange * 10) / 10,
      trend
    };
  });

  return Response.json({
    period: { start: startTime, end: new Date().toISOString() },
    items
  });
}

/**
 * 获取持续热点标签
 */
async function getPersistentTags(d1: D1Database, startTime: string, limit: number) {
  const stmt = d1.prepare(`
    SELECT
      tag,
      COUNT(*) as appearance_count,
      AVG(count) as avg_count,
      MAX(count) as max_count,
      MIN(rank) as best_rank
    FROM tag_snapshots
    WHERE scan_time >= ?
    GROUP BY tag
    HAVING appearance_count >= 3
    ORDER BY avg_count DESC, appearance_count DESC
    LIMIT ?
  `);

  const result = await stmt.bind(startTime, limit).all();

  const items = (result.results || []).map((row: any) => ({
    tag: row.tag,
    appearanceCount: row.appearance_count,
    avgCount: Math.round(row.avg_count),
    maxCount: row.max_count,
    bestRank: row.best_rank
  }));

  return Response.json({
    period: { start: startTime, end: new Date().toISOString() },
    items
  });
}

/**
 * 获取指定时间段内Top标签
 */
async function getTopTags(d1: D1Database, startTime: string, limit: number) {
  const stmt = d1.prepare(`
    SELECT
      tag,
      SUM(count) as total_count,
      COUNT(*) as appearance_count,
      AVG(rank) as avg_rank
    FROM tag_snapshots
    WHERE scan_time >= ?
    GROUP BY tag
    ORDER BY total_count DESC
    LIMIT ?
  `);

  const result = await stmt.bind(startTime, limit).all();

  const items = (result.results || []).map((row: any) => ({
    tag: row.tag,
    totalCount: row.total_count,
    appearanceCount: row.appearance_count,
    avgRank: Math.round(row.avg_rank)
  }));

  return Response.json({
    period: { start: startTime, end: new Date().toISOString() },
    items
  });
}

/**
 * 获取实时热搜聚合（最近N小时的总热度）
 * 用于"实时热搜"Tab，返回指定时间段内的累计热度排名
 */
async function getRealtimeTags(d1: D1Database, startTime: string, limit: number) {
  const stmt = d1.prepare(`
    SELECT
      tag,
      SUM(count) as total_count,
      COUNT(*) as appearance_count,
      AVG(count) as avg_count,
      MAX(count) as max_count
    FROM tag_snapshots
    WHERE scan_time >= ?
    GROUP BY tag
    ORDER BY total_count DESC
    LIMIT ?
  `);

  const result = await stmt.bind(startTime, limit).all();

  const items: RealtimeItem[] = (result.results || []).map((row: any) => ({
    tag: row.tag,
    totalCount: row.total_count,
    avgCount: Math.round(row.avg_count),
    appearanceCount: row.appearance_count
  }));

  return Response.json({
    period: { start: startTime, end: new Date().toISOString() },
    items
  });
}

/**
 * 获取最新标签状态
 */
async function getLatestTags(d1: D1Database, limit: number) {
  const stmt = d1.prepare(`
    SELECT scan_time, tag, count, rank, period
    FROM tag_snapshots
    WHERE scan_time = (
      SELECT MAX(scan_time) FROM tag_snapshots
    )
    ORDER BY rank
    LIMIT ?
  `);

  const result = await stmt.bind(limit).all();

  const items = (result.results || []).map((row: any) => ({
    tag: row.tag,
    count: row.count,
    rank: row.rank,
    scanTime: row.scan_time
  }));

  return Response.json({
    scanTime: items.length > 0 ? items[0].scanTime : null,
    items
  });
}
