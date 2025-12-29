/**
 * News Module - Source Health Monitoring with Circuit Breaker
 *
 * 实现：
 * 1. 电路熔断器模式 (Circuit Breaker Pattern)
 * 2. 源健康状态追踪
 * 3. 性能指标收集
 * 4. 自动故障恢复
 */

import type { KVStorage } from '@/lib/storage/kv';
import type {
  SourceHealthRecord,
  SourceHealthStatus,
  CircuitState,
  HealthCheckResult,
  HealthCheckConfig,
  SystemHealthSummary,
} from './health-types';
import { DEFAULT_HEALTH_CONFIG } from './health-types';

// ============================================================================
// KV Storage Keys
// ============================================================================

const HEALTH_KEYS = {
  SOURCE_HEALTH: (sourceId: number) => `news:health:source:${sourceId}`,
  ALL_HEALTH: 'news:health:all',
  LAST_GLOBAL_CHECK: 'news:health:last_check',
  CHECK_HISTORY: (sourceId: number) => `news:health:history:${sourceId}`,
} as const;

// ============================================================================
// In-Memory State (for single instance)
// ============================================================================

interface CircuitBreakerState {
  state: CircuitState;
  openedAt?: number;
  lastCheckTime?: number;
}

const circuitStateCache = new Map<number, CircuitBreakerState>();

// ============================================================================
// Health Status Calculation
// ============================================================================

/**
 * 根据检查记录计算健康状态
 */
function calculateHealthStatus(
  record: SourceHealthRecord,
  config: HealthCheckConfig
): SourceHealthStatus {
  // 如果电路熔断打开
  if (record.consecutive_failures >= config.circuit_failure_threshold) {
    return 'down';
  }

  // 检查成功率
  if (record.success_rate < config.degraded_success_rate) {
    return 'degraded';
  }

  // 检查延迟
  if (record.avg_latency_ms > config.degraded_latency_ms) {
    return 'degraded';
  }

  // 检查最近的失败
  const now = Math.floor(Date.now() / 1000);
  const recentFailures = record.last_failure_at
    ? (now - record.last_failure_at) < 3600  // 1小时内
    : false;

  if (recentFailures && record.consecutive_failures > 0) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * 计算电路状态
 */
function calculateCircuitState(
  record: SourceHealthRecord,
  config: HealthCheckConfig
): CircuitState {
  const cachedState = circuitStateCache.get(record.source_id);
  const now = Date.now();

  // 检查是否应该从半开状态转换
  if (cachedState?.state === 'half_open') {
    if (record.consecutive_successes >= config.circuit_recovery_threshold) {
      // 恢复正常
      circuitStateCache.set(record.source_id, { state: 'closed' });
      return 'closed';
    }
    if (record.consecutive_failures > 0) {
      // 再次失败，回到打开状态
      circuitStateCache.set(record.source_id, {
        state: 'open',
        openedAt: now,
      });
      return 'open';
    }
    return 'half_open';
  }

  // 检查是否应该熔断
  if (record.consecutive_failures >= config.circuit_failure_threshold) {
    if (!cachedState || cachedState.state !== 'open') {
      circuitStateCache.set(record.source_id, {
        state: 'open',
        openedAt: now,
      });
    }
    return 'open';
  }

  // 检查是否应该从打开状态恢复到半开
  if (cachedState?.state === 'open') {
    const timeSinceOpened = cachedState.openedAt
      ? now - cachedState.openedAt
      : Infinity;

    if (timeSinceOpened >= config.circuit_open_duration_ms) {
      circuitStateCache.set(record.source_id, {
        state: 'half_open',
        lastCheckTime: now,
      });
      return 'half_open';
    }
    return 'open';
  }

  // 默认关闭状态（正常运行）
  circuitStateCache.set(record.source_id, { state: 'closed' });
  return 'closed';
}

/**
 * 更新健康记录
 */
function updateHealthRecord(
  record: SourceHealthRecord,
  result: HealthCheckResult,
  config: HealthCheckConfig
): SourceHealthRecord {
  const now = result.checked_at;  // Already using correct name

  // 更新连续失败/成功计数
  let consecutiveFailures = record.consecutive_failures;
  let consecutiveSuccesses = record.consecutive_successes;

  if (result.success) {
    consecutiveFailures = 0;
    consecutiveSuccesses += 1;
  } else {
    consecutiveFailures += 1;
    consecutiveSuccesses = 0;
  }

  // 更新成功率 (指数移动平均)
  const newSuccessRate = result.success
    ? record.success_rate * 0.9 + 0.1
    : record.success_rate * 0.9;

  // 更新延迟 (指数移动平均)
  const newAvgLatency = result.success
    ? record.avg_latency_ms * 0.8 + result.latency_ms * 0.2
    : record.avg_latency_ms;

  // 更新平均文章数
  const newAvgItems = record.avg_items_per_fetch * 0.9 + result.items_count * 0.1;

  // 更新错误计数
  const errorCount = result.success
    ? Math.max(0, record.error_count_24h - 1)
    : record.error_count_24h + 1;

  const updated: SourceHealthRecord = {
    ...record,
    last_check_at: result.checked_at,
    last_fetch_time_ms: result.latency_ms,
    last_item_count: result.items_count,
    consecutive_failures: consecutiveFailures,
    consecutive_successes: consecutiveSuccesses,
    success_rate: Math.round(newSuccessRate * 1000) / 1000,
    avg_latency_ms: Math.round(newAvgLatency),
    last_error: result.error,
    avg_items_per_fetch: Math.round(newAvgItems * 10) / 10,
    error_count_24h: errorCount,
  };

  if (result.success) {
    updated.last_success_at = now;
  } else {
    updated.last_failure_at = now;
  }

  // 计算健康状态和电路状态
  updated.status = calculateHealthStatus(updated, config);
  updated.circuit_state = calculateCircuitState(updated, config);

  return updated;
}

// ============================================================================
// KV Operations
// ============================================================================

/**
 * 从 KV 获取源健康记录
 */
export async function getSourceHealthRecord(
  kv: KVStorage,
  sourceId: number
): Promise<SourceHealthRecord | null> {
  try {
    const result = await kv.get(HEALTH_KEYS.SOURCE_HEALTH(sourceId), {
      type: 'text',
    });

    if (typeof result !== 'string') return null;

    return JSON.parse(result) as SourceHealthRecord;
  } catch (error) {
    console.error(`[health-monitor] Failed to get health record for source ${sourceId}:`, error);
    return null;
  }
}

/**
 * 保存源健康记录到 KV
 */
export async function saveSourceHealthRecord(
  kv: KVStorage,
  record: SourceHealthRecord,
  ttlSeconds: number = 86400  // 24 hours
): Promise<void> {
  try {
    await kv.put(
      HEALTH_KEYS.SOURCE_HEALTH(record.source_id),
      JSON.stringify(record),
      { expirationTtl: ttlSeconds }
    );
  } catch (error) {
    console.error(`[health-monitor] Failed to save health record for source ${record.source_id}:`, error);
  }
}

/**
 * 批量保存所有健康记录
 */
export async function saveAllHealthRecords(
  kv: KVStorage,
  records: SourceHealthRecord[]
): Promise<void> {
  try {
    await Promise.all(
      records.map(record => saveSourceHealthRecord(kv, record))
    );

    // 保存摘要
    const summary: SystemHealthSummary = buildSystemSummary(records);
    await kv.put(
      HEALTH_KEYS.ALL_HEALTH,
      JSON.stringify(summary),
      { expirationTtl: 300 }  // 5 minutes
    );

    await kv.put(
      HEALTH_KEYS.LAST_GLOBAL_CHECK,
      String(Math.floor(Date.now() / 1000)),
      { expirationTtl: 3600 }
    );
  } catch (error) {
    console.error('[health-monitor] Failed to save health records:', error);
  }
}

/**
 * 获取系统健康摘要
 */
export async function getSystemHealthSummary(
  kv: KVStorage
): Promise<SystemHealthSummary | null> {
  try {
    const result = await kv.get(HEALTH_KEYS.ALL_HEALTH, { type: 'text' });

    if (typeof result !== 'string') return null;

    return JSON.parse(result) as SystemHealthSummary;
  } catch (error) {
    console.error('[health-monitor] Failed to get system health summary:', error);
    return null;
  }
}

/**
 * 获取所有源健康记录
 */
export async function getAllHealthRecords(
  kv: KVStorage,
  sourceIds: number[]
): Promise<SourceHealthRecord[]> {
  const records: SourceHealthRecord[] = [];

  await Promise.all(
    sourceIds.map(async (sourceId) => {
      const record = await getSourceHealthRecord(kv, sourceId);
      if (record) {
        records.push(record);
      }
    })
  );

  return records;
}

// ============================================================================
// Health Check Execution
// ============================================================================

/**
 * 执行单个源的健康检查
 */
export async function checkSourceHealth(
  source: {
    id: number;
    name: string;
    url?: string;
    strategy: 'DIRECT' | 'RSSHUB';
    rsshub_path?: string;
  },
  config: HealthCheckConfig = DEFAULT_HEALTH_CONFIG,
  rsshubBaseUrl?: string
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkedAt = Math.floor(Date.now() / 1000);

  // 构建URL
  const url =
    source.strategy === 'RSSHUB'
      ? `${rsshubBaseUrl || 'https://rsshub.app'}${source.rsshub_path}`
      : source.url;

  if (!url) {
    return {
      source_id: source.id,
      source_name: source.name,
      success: false,
      latency_ms: 0,
      items_count: 0,
      error: 'No URL configured',
      checked_at: checkedAt,
    };
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsHealthCheck/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(config.fetch_timeout_ms),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      return {
        source_id: source.id,
        source_name: source.name,
        success: false,
        latency_ms: latency,
        items_count: 0,
        error: `HTTP ${response.status}`,
        checked_at: checkedAt,
      };
    }

    const text = await response.text();

    // 简单验证 RSS 内容
    const hasItems = /<item\b/i.test(text) || /<entry\b/i.test(text);
    const itemCount = (text.match(/<item\b/gi) || []).length;

    if (!hasItems) {
      return {
        source_id: source.id,
        source_name: source.name,
        success: false,
        latency_ms: latency,
        items_count: 0,
        error: 'Invalid RSS content (no items)',
        checked_at: checkedAt,
      };
    }

    return {
      source_id: source.id,
      source_name: source.name,
      success: true,
      latency_ms: latency,
      items_count: itemCount,
      checked_at: checkedAt,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      source_id: source.id,
      source_name: source.name,
      success: false,
      latency_ms: latency,
      items_count: 0,
      error: message,
      checked_at: checkedAt,
    };
  }
}

/**
 * 执行所有源的健康检查
 */
export async function checkAllSourcesHealth(
  sources: Array<{
    id: number;
    name: string;
    url?: string;
    strategy: 'DIRECT' | 'RSSHUB';
    rsshub_path?: string;
    category?: string;
    is_active?: number | boolean;
  }>,
  kv: KVStorage,
  config: HealthCheckConfig = DEFAULT_HEALTH_CONFIG,
  rsshubBaseUrl?: string
): Promise<SourceHealthRecord[]> {
  const results: SourceHealthRecord[] = [];

  // 并发检查所有源
  const checkResults = await Promise.all(
    sources.map(source =>
      checkSourceHealth(source, config, rsshubBaseUrl)
    )
  );

  // 获取现有记录并更新
  for (const result of checkResults) {
    const existing = await getSourceHealthRecord(kv, result.source_id);

    const record: SourceHealthRecord = existing
      ? updateHealthRecord(existing, result, config)
      : createInitialHealthRecord(result, sources.find(s => s.id === result.source_id)!);

    results.push(record);
  }

  // 保存所有记录
  await saveAllHealthRecords(kv, results);

  return results;
}

/**
 * 创建初始健康记录
 */
function createInitialHealthRecord(
  result: HealthCheckResult,
  source: {
    id: number;
    name: string;
    category?: string;
    is_active?: number | boolean;
  }
): SourceHealthRecord {
  const isActive = typeof source.is_active === 'boolean'
    ? source.is_active
    : source.is_active === 1;

  return {
    source_id: result.source_id,
    source_name: result.source_name,
    status: result.success ? 'healthy' : 'down',
    circuit_state: result.success ? 'closed' : 'open',
    avg_latency_ms: result.latency_ms,
    p95_latency_ms: result.latency_ms,
    last_fetch_time_ms: result.latency_ms,
    success_rate: result.success ? 1.0 : 0.0,
    consecutive_failures: result.success ? 0 : 1,
    consecutive_successes: result.success ? 1 : 0,
    last_check_at: result.checked_at,
    last_success_at: result.success ? result.checked_at : undefined,
    last_failure_at: result.success ? undefined : result.checked_at,
    last_error: result.error,
    error_count_24h: result.success ? 0 : 1,
    avg_items_per_fetch: result.items_count,
    last_item_count: result.items_count,
    is_active: isActive,
    category: source.category,
  };
}

// ============================================================================
// System Summary
// ============================================================================

/**
 * 构建系统健康摘要
 */
export function buildSystemSummary(
  records: SourceHealthRecord[]
): SystemHealthSummary {
  const healthy = records.filter(r => r.status === 'healthy').length;
  const degraded = records.filter(r => r.status === 'degraded').length;
  const down = records.filter(r => r.status === 'down').length;

  // 按分类统计
  const byCategory: Record<string, { total: number; healthy: number; degraded: number; down: number }> = {};

  for (const record of records) {
    const cat = record.category || 'uncategorized';
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, healthy: 0, degraded: 0, down: 0 };
    }
    byCategory[cat].total++;
    const status = record.status as 'healthy' | 'degraded' | 'down' | 'unknown';
    if (status === 'healthy') byCategory[cat].healthy++;
    else if (status === 'degraded') byCategory[cat].degraded++;
    else if (status === 'down') byCategory[cat].down++;
    // 'unknown' status doesn't count towards health metrics
  }

  // 确定整体状态
  let overallStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
  if (down > records.length / 2) {
    overallStatus = 'down';
  } else if (degraded > 0 || down > 0) {
    overallStatus = 'degraded';
  }

  const lastCheckAt = records.length > 0
    ? Math.max(...records.map(r => r.last_check_at))
    : Math.floor(Date.now() / 1000);

  return {
    overall_status: overallStatus,
    total_sources: records.length,
    healthy_sources: healthy,
    degraded_sources: degraded,
    down_sources: down,
    by_category: byCategory,
    last_check_at: lastCheckAt,
    sources: records,
  };
}

// ============================================================================
// Circuit Breaker Utilities
// ============================================================================

/**
 * 检查源是否应该被跳过（电路熔断）
 */
export function shouldSkipSource(
  sourceId: number,
  force: boolean = false
): boolean {
  if (force) return false;

  const state = circuitStateCache.get(sourceId);
  return state?.state === 'open';
}

/**
 * 手动重置源的电路状态
 */
export function resetCircuitBreaker(sourceId: number): void {
  circuitStateCache.delete(sourceId);
}

/**
 * 获取电路状态
 */
export function getCircuitState(sourceId: number): CircuitState {
  return circuitStateCache.get(sourceId)?.state ?? 'closed';
}
