/**
 * Intelligence Source Repository - 数据访问层
 *
 * 提供 intelligence_sources 表的 CRUD 操作
 */

import type { Database } from '@/lib/storage/db';
import type {
  IntelligenceSource,
  CreateSourceInput,
  UpdateSourceInput,
  SourceRuntimeInfo,
} from './types';

/**
 * 获取所有数据源
 */
export async function getAllSources(db: Database): Promise<IntelligenceSource[]> {
  const result = await db
    .prepare('SELECT * FROM intelligence_sources ORDER BY weight DESC, id')
    .all<IntelligenceSource>();

  return result.results || [];
}

/**
 * 获取活跃的数据源
 */
export async function getActiveSources(db: Database): Promise<IntelligenceSource[]> {
  const result = await db
    .prepare(`
      SELECT * FROM intelligence_sources
      WHERE is_active = 1
      ORDER BY weight DESC, id
    `)
    .all<IntelligenceSource>();

  return result.results || [];
}

/**
 * 根据 ID 获取单个数据源
 */
export async function getSourceById(
  db: Database,
  id: number
): Promise<IntelligenceSource | null> {
  const result = await db
    .prepare('SELECT * FROM intelligence_sources WHERE id = ?')
    .bind(id)
    .first<IntelligenceSource>();

  return result || null;
}

/**
 * 根据 category 获取数据源
 */
export async function getSourcesByCategory(
  db: Database,
  category: string
): Promise<IntelligenceSource[]> {
  const result = await db
    .prepare('SELECT * FROM intelligence_sources WHERE category = ? ORDER BY weight DESC')
    .bind(category)
    .all<IntelligenceSource>();

  return result.results || [];
}

/**
 * 根据 strategy 获取数据源
 */
export async function getSourcesByStrategy(
  db: Database,
  strategy: 'DIRECT' | 'RSSHUB'
): Promise<IntelligenceSource[]> {
  const result = await db
    .prepare('SELECT * FROM intelligence_sources WHERE strategy = ? AND is_active = 1 ORDER BY weight DESC')
    .bind(strategy)
    .all<IntelligenceSource>();

  return result.results || [];
}

/**
 * 创建新数据源
 */
export async function createSource(
  db: Database,
  input: CreateSourceInput
): Promise<IntelligenceSource> {
  const now = new Date().toISOString();

  const result = await db
    .prepare(`
      INSERT INTO intelligence_sources (
        name, url, strategy, rsshub_path, category,
        weight, logic_filter, is_active, reliability_score,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.name,
      input.url,
      input.strategy,
      input.rsshub_path ?? null,
      input.category ?? null,
      input.weight ?? 1.0,
      input.logic_filter ?? null,
      input.is_active ?? 1,
      1.0, // 初始可靠性评分
      now,
      now
    )
    .run();

  if (!result.meta.last_row_id) {
    throw new Error('Failed to create source: no row ID returned');
  }

  return getSourceById(db, result.meta.last_row_id) as Promise<IntelligenceSource>;
}

/**
 * 更新数据源
 */
export async function updateSource(
  db: Database,
  id: number,
  input: UpdateSourceInput
): Promise<IntelligenceSource | null> {
  const current = await getSourceById(db, id);
  if (!current) return null;

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }
  if (input.url !== undefined) {
    updates.push('url = ?');
    values.push(input.url);
  }
  if (input.strategy !== undefined) {
    updates.push('strategy = ?');
    values.push(input.strategy);
  }
  if (input.rsshub_path !== undefined) {
    updates.push('rsshub_path = ?');
    values.push(input.rsshub_path);
  }
  if (input.category !== undefined) {
    updates.push('category = ?');
    values.push(input.category);
  }
  if (input.weight !== undefined) {
    updates.push('weight = ?');
    values.push(input.weight);
  }
  if (input.logic_filter !== undefined) {
    updates.push('logic_filter = ?');
    values.push(input.logic_filter);
  }
  if (input.is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(input.is_active);
  }
  if (input.reliability_score !== undefined) {
    updates.push('reliability_score = ?');
    values.push(input.reliability_score);
  }

  if (updates.length === 0) return current;

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  await db
    .prepare(`UPDATE intelligence_sources SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return getSourceById(db, id);
}

/**
 * 删除数据源
 */
export async function deleteSource(db: Database, id: number): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM intelligence_sources WHERE id = ?')
    .bind(id)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

/**
 * 更新最后抓取时间和可靠性评分
 */
export async function updateSourceScrapeStatus(
  db: Database,
  sourceId: number,
  success: boolean
): Promise<void> {
  const current = await getSourceById(db, sourceId);
  if (!current) return;

  // 计算新的可靠性评分
  const increment = success ? 0.02 : -0.1;
  const newScore = Math.min(1.0, Math.max(0.0, current.reliability_score + increment));
  const now = new Date().toISOString();

  await db
    .prepare(`
      UPDATE intelligence_sources
      SET last_scraped_at = ?, reliability_score = ?, updated_at = ?
      WHERE id = ?
    `)
    .bind(now, newScore, now, sourceId)
    .run();
}

/**
 * 获取统计信息
 */
export async function getSourceStats(db: Database): Promise<{
  total: number;
  active: number;
  byStrategy: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  const totalResult = await db
    .prepare('SELECT COUNT(*) as count FROM intelligence_sources')
    .first<{ count: number }>();

  const activeResult = await db
    .prepare('SELECT COUNT(*) as count FROM intelligence_sources WHERE is_active = 1')
    .first<{ count: number }>();

  const strategyResult = await db
    .prepare('SELECT strategy, COUNT(*) as count FROM intelligence_sources GROUP BY strategy')
    .all<{ strategy: string; count: number }>();

  const categoryResult = await db
    .prepare('SELECT category, COUNT(*) as count FROM intelligence_sources GROUP BY category')
    .all<{ category: string; count: number }>();

  const byStrategy: Record<string, number> = {};
  for (const row of strategyResult.results || []) {
    byStrategy[row.strategy] = row.count;
  }

  const byCategory: Record<string, number> = {};
  for (const row of categoryResult.results || []) {
    if (row.category) {
      byCategory[row.category] = row.count;
    }
  }

  return {
    total: totalResult?.count ?? 0,
    active: activeResult?.count ?? 0,
    byStrategy,
    byCategory,
  };
}
