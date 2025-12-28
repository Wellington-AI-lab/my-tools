/**
 * Tag Normalization & Fusion Module
 *
 * 双向一致性策略 - Part 2: 下游标签融合与归一化
 * 作为双重保险，处理 AI 模型可能产生的变体标签
 */

import { VALID_TAGS, TAG_ALIAS_MAP, normalizeSingleTag } from './tag-taxonomy';

// D1 类型定义
declare interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

declare interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
}

declare interface D1Result {
  success: boolean;
  meta?: {
    duration?: number;
    changes?: number;
    last_row_id?: number;
    served_by?: string;
  };
}

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * 被丢弃的标签信息
 */
export interface DroppedTag {
  /** 原始标签 */
  original: string;
  /** 归一化后的标签 */
  normalized: string;
  /** 丢弃原因 */
  reason: 'NOT_IN_WHITELIST' | 'EMPTY' | 'DUPLICATE';
}

/**
 * 标签融合选项
 */
export interface FusionOptions {
  /**
   * 是否严格模式：
   * - true: 不在白名单的标签直接丢弃
   * - false: 保留未知标签（便于调试和发现新模式）
   *
   * 建议：生产环境使用 true，开发/监控阶段使用 false
   */
  strict?: boolean;

  /**
   * 是否记录被丢弃的标签（用于监控和迭代优化）
   */
  logger?: (droppedTags: DroppedTag[]) => void;
}

/**
 * 标签融合统计信息
 */
export interface TagFusionStats {
  totalInput: number;
  totalOutput: number;
  modelAOnly: string[];
  modelBOnly: string[];
  intersection: string[];
  droppedTags: DroppedTag[];
}

// =============================================================================
// Core Function: fuseAndNormalizeTags
// =============================================================================

/**
 * 融合并标准化两个模型的标签输出
 *
 * @param modelATags - 模型 A 输出的标签数组
 * @param modelBTags - 模型 B 输出的标签数组
 * @param options - 可选配置
 * @returns 标准化后的去重标签数组
 *
 * @example
 * ```ts
 * const modelA = ["中国", "AI", "新能源"];
 * const modelB = ["CN", "人工智能", "新能源车", "芯片"];
 *
 * const result = fuseAndNormalizeTags(modelA, modelB);
 * console.log(result);
 * // Output: ["中国", "人工智能", "新能源车", "芯片"]
 * ```
 */
export function fuseAndNormalizeTags(
  modelATags: string[],
  modelBTags: string[],
  options: FusionOptions = {}
): string[] {
  const { strict = true, logger } = options;
  const droppedTags: DroppedTag[] = [];

  // Step 1: Fusion - 合并两个模型的输出
  const rawTags = [...modelATags, ...modelBTags];

  // Step 2: Normalization & Whitelist Check
  const normalizedSet = new Set<string>();
  const seen = new Set<string>(); // 用于检测重复

  for (const rawTag of rawTags) {
    // 2.1 Trim
    const trimmed = rawTag.trim();
    if (!trimmed) {
      droppedTags.push({ original: rawTag, normalized: '', reason: 'EMPTY' });
      continue;
    }

    // 2.2 归一化处理（别名映射 + 白名单校验）
    const normalized = normalizeSingleTag(trimmed);

    if (normalized) {
      // 2.3 检查是否已添加
      if (!seen.has(normalized)) {
        normalizedSet.add(normalized);
        seen.add(normalized);
      } else {
        droppedTags.push({ original: rawTag, normalized, reason: 'DUPLICATE' });
      }
    } else {
      // 不在白名单中的处理策略
      droppedTags.push({
        original: rawTag,
        normalized: trimmed,
        reason: 'NOT_IN_WHITELIST'
      });

      if (!strict) {
        // 非严格模式：保留未知标签，便于调试
        if (!seen.has(trimmed)) {
          normalizedSet.add(trimmed);
          seen.add(trimmed);
        }
      }
      // 严格模式：直接丢弃
    }
  }

  // Step 3: Log dropped tags if logger provided
  if (logger && droppedTags.length > 0) {
    logger(droppedTags);
  }

  // Step 4: Output - 返回有序数组（便于测试和一致性）
  return Array.from(normalizedSet).sort();
}

// =============================================================================
// Extended Function: with Stats
// =============================================================================

/**
 * 带统计信息的标签融合函数
 * 适用于需要分析模型表现的场景
 *
 * @example
 * ```ts
 * const { tags, stats } = fuseAndNormalizeTagsWithStats(modelA, modelB);
 * console.log(`融合结果: ${tags.length} 个标签`);
 * console.log(`模型 A 独有: ${stats.modelAOnly}`);
 * console.log(`丢弃的标签: ${stats.droppedTags}`);
 * ```
 */
export function fuseAndNormalizeTagsWithStats(
  modelATags: string[],
  modelBTags: string[],
  options: FusionOptions = {}
): { tags: string[]; stats: TagFusionStats } {
  const droppedTags: DroppedTag[] = [];
  const { strict = true } = options;

  // 标准化处理（复用上述逻辑）
  const normalize = (tag: string): string | null => {
    const trimmed = tag.trim();
    if (!trimmed) return null;

    const lowerKey = trimmed.toLowerCase();
    let normalized = TAG_ALIAS_MAP[lowerKey] ?? trimmed;

    if (VALID_TAGS.has(normalized)) {
      return normalized;
    }

    droppedTags.push({ original: tag, normalized, reason: 'NOT_IN_WHITELIST' });
    return strict ? null : normalized;
  };

  const normalizedA = modelATags.map(normalize).filter(Boolean) as string[];
  const normalizedB = modelBTags.map(normalize).filter(Boolean) as string[];
  const setA = new Set(normalizedA);
  const setB = new Set(normalizedB);

  // 计算统计信息
  const intersection = Array.from(setA).filter(x => setB.has(x));
  const modelAOnly = Array.from(setA).filter(x => !setB.has(x));
  const modelBOnly = Array.from(setB).filter(x => !setA.has(x));
  const fused = fuseAndNormalizeTags(modelATags, modelBTags, options);

  return {
    tags: fused,
    stats: {
      totalInput: modelATags.length + modelBTags.length,
      totalOutput: fused.length,
      modelAOnly,
      modelBOnly,
      intersection,
      droppedTags,
    },
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * 批量融合标签
 * 用于处理多条新闻的标签融合场景
 */
export function batchFuseTags(
  tagPairs: Array<{ modelA: string[]; modelB: string[] }>,
  options?: FusionOptions
): string[][] {
  return tagPairs.map(pair => fuseAndNormalizeTags(pair.modelA, pair.modelB, options));
}

/**
 * 创建一个简单的日志记录器
 * 将 dropped tags 输出到控制台或发送到监控服务
 */
export function createConsoleLogger(prefix: string = '[TagNormalization]'): (droppedTags: DroppedTag[]) => void {
  return (droppedTags: DroppedTag[]) => {
    if (droppedTags.length === 0) return;

    const byReason = droppedTags.reduce((acc, tag) => {
      if (!acc[tag.reason]) {
        acc[tag.reason] = [];
      }
      acc[tag.reason].push(tag);
      return acc;
    }, {} as Record<string, DroppedTag[]>);

    for (const [reason, tags] of Object.entries(byReason)) {
      console.warn(
        `${prefix} Dropped ${tags.length} tags (${reason}):`,
        tags.map(t => `"${t.original}"`).join(', ')
      );
    }
  };
}

/**
 * 创建 D1 数据库日志记录器
 * 将 dropped tags 写入 D1 用于后续分析
 *
 * @param db - D1 数据库实例
 * @param scanId - 可选的扫描 ID，用于关联特定扫描
 * @param batchSize - 批量插入大小，默认 100
 */
export function createD1Logger(
  db: D1Database,
  scanId?: string,
  batchSize: number = 100
): (droppedTags: DroppedTag[]) => Promise<void> {
  return async (droppedTags: DroppedTag[]) => {
    if (droppedTags.length === 0) return;

    try {
      const createdAt = new Date().toISOString();

      // 批量插入以提高性能
      for (let i = 0; i < droppedTags.length; i += batchSize) {
        const batch = droppedTags.slice(i, i + batchSize);

        // 构建批量插入语句
        const placeholders = batch.map(() => '(?, ?, ?, ?)').join(', ');
        const values = batch.flatMap(tag => [
          tag.original,
          tag.normalized,
          tag.reason,
          createdAt,
        ]);

        await db
          .prepare(`
            INSERT INTO dropped_tags (original_tag, normalized_tag, reason, created_at, scan_id)
            VALUES ${placeholders}
          `)
          .bind(...values, scanId ?? null)
          .run();
      }

      console.log(`[TagNormalization] Logged ${droppedTags.length} dropped tags to D1`);
    } catch (error) {
      console.error('[TagNormalization] Failed to log dropped tags to D1:', error);
    }
  };
}

/**
 * 记录模型融合统计信息到 D1
 * 用于追踪模型一致性和性能表现
 */
export async function logFusionStats(
  db: D1Database,
  stats: TagFusionStats,
  modelAName: string,
  modelBName: string,
  scanTime?: string
): Promise<void> {
  try {
    const timestamp = scanTime ?? new Date().toISOString();

    await db
      .prepare(`
        INSERT INTO model_fusion_stats
          (scan_time, model_a_name, model_b_name, total_input, total_output,
           intersection_count, dropped_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        timestamp,
        modelAName,
        modelBName,
        stats.totalInput,
        stats.totalOutput,
        stats.intersection.length,
        stats.droppedTags.length,
        timestamp
      )
      .run();

    console.log(`[TagNormalization] Logged fusion stats to D1`);
  } catch (error) {
    console.error('[TagNormalization] Failed to log fusion stats to D1:', error);
  }
}

// =============================================================================
// Export for use in other modules
// =============================================================================

export { VALID_TAGS, TAG_ALIAS_MAP, normalizeSingleTag } from './tag-taxonomy';
