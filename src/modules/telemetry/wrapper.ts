/**
 * Telemetry Wrapper - AI 调用监控和成本追踪
 *
 * 轻量级遥测包装器，自动记录:
 * - cache_hit / cache_miss
 * - token_usage (估算)
 * - latency_ms
 * - 成本估算
 *
 * 原则: 监控不能成为性能瓶颈，所有记录操作异步化
 */

import type { KVStorage } from '@/lib/storage/kv';

// ============================================================================
// Types
// ============================================================================

export interface TelemetryEvent {
  timestamp: number;
  endpoint: string;         // 'summarize', 'feed', 'push', etc.
  cache_hit: boolean;
  cache_miss: boolean;
  token_input?: number;
  token_output?: number;
  latency_ms: number;
  success: boolean;
  error?: string;
}

export interface TelemetryStats {
  // 请求数
  total_requests: number;
  cache_hits: number;
  cache_misses: number;

  // Token 使用
  total_tokens_in: number;
  total_tokens_out: number;
  total_tokens: number;

  // 性能
  avg_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;

  // 成本估算 (USD)
  estimated_cost_usd: number;

  // 时间范围
  period_start: number;
  period_end: number;

  // 缓存命中率
  cache_hit_ratio: number;
}

export interface CostConfig {
  // 每 1M tokens 价格 (USD)
  input_price_per_million: number;
  output_price_per_million: number;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_COST_CONFIG: CostConfig = {
  // OpenAI GPT-4o 定价 (参考)
  input_price_per_million: 2.5,
  output_price_per_million: 10.0,
};

// Claude 3.5 Sonnet 定价
const CLAUDE_COST_CONFIG: CostConfig = {
  input_price_per_million: 3.0,
  output_price_per_million: 15.0,
};

// ============================================================================
// KV Keys
// ============================================================================

const TELEMETRY_KEYS = {
  // 小时级指标 (保留 7 天)
  HOURLY: (hour: number) => `telemetry:h:${hour}`,

  // 日级汇总 (保留 30 天)
  DAILY: (day: number) => `telemetry:d:${day}`,

  // 实时事件 (保留 1 小时)
  RECENT: 'telemetry:recent',

  // 总计 (永久)
  TOTAL: 'telemetry:total',
} as const;

// ============================================================================
// In-Memory Buffer (减少 KV 写入)
// ============================================================================

const memoryBuffer: TelemetryEvent[] = [];
const BUFFER_FLUSH_INTERVAL = 30000; // 30 秒
const MAX_BUFFER_SIZE = 100;

let flushTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * 估算文本的 token 数量
 * 粗略估算: 英文约 4 字符/token, 中文约 2 字符/token
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // 统计中文字符
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // 其他字符
  const otherChars = text.length - chineseChars;

  // 中文: 约 0.5 token/字符, 英文: 约 0.25 token/字符
  return Math.ceil(chineseChars * 0.5 + otherChars * 0.25);
}

/**
 * 估算输入 token 数 (基于 prompt 和 content)
 */
export function estimateInputTokens(
  systemPrompt: string,
  userContent: string
): number {
  return estimateTokens(systemPrompt) + estimateTokens(userContent);
}

/**
 * 估算输出 token 数 (基于 completion)
 */
export function estimateOutputTokens(completion: string): number {
  return estimateTokens(completion);
}

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * 计算成本 (USD)
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  config: CostConfig = DEFAULT_COST_CONFIG
): number {
  const inputCost = (inputTokens / 1_000_000) * config.input_price_per_million;
  const outputCost = (outputTokens / 1_000_000) * config.output_price_per_million;
  return inputCost + outputCost;
}

/**
 * 格式化成本显示
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `< $0.01`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

// ============================================================================
// Telemetry Recording
// ============================================================================

/**
 * 记录遥测事件 (异步，非阻塞)
 */
export async function recordTelemetry(
  kv: KVStorage,
  event: TelemetryEvent
): Promise<void> {
  // 添加到内存缓冲区
  memoryBuffer.push(event);

  // 如果缓冲区满了，立即刷新
  if (memoryBuffer.length >= MAX_BUFFER_SIZE) {
    flushBuffer(kv).catch(() => {});
  }

  // 启动定时刷新
  startFlushTimer(kv);
}

/**
 * 刷新缓冲区到 KV
 */
async function flushBuffer(kv: KVStorage): Promise<void> {
  if (memoryBuffer.length === 0) return;

  const events = memoryBuffer.splice(0, memoryBuffer.length);

  try {
    // 按小时分组
    const byHour = new Map<number, TelemetryEvent[]>();
    const now = Date.now();
    const currentHour = Math.floor(now / 3600000);

    for (const event of events) {
      const hour = Math.floor(event.timestamp / 3600000);
      if (!byHour.has(hour)) {
        byHour.set(hour, []);
      }
      byHour.get(hour)!.push(event);
    }

    // 写入 KV
    await Promise.all([
      // 更新小时级指标
      ...Array.from(byHour.entries()).map(([hour, hourEvents]) =>
        updateHourlyMetrics(kv, hour, hourEvents)
      ),

      // 更新最近事件列表
      updateRecentEvents(kv, events),

      // 更新总计
      updateTotalMetrics(kv, events),
    ]);

    console.log(`[telemetry] Flushed ${events.length} events to KV`);
  } catch (error) {
    console.error('[telemetry] Failed to flush buffer:', error);
  }
}

/**
 * 更新小时级指标
 */
async function updateHourlyMetrics(
  kv: KVStorage,
  hour: number,
  events: TelemetryEvent[]
): Promise<void> {
  const key = TELEMETRY_KEYS.HOURLY(hour);

  try {
    const existing = await kv.get(key, { type: 'json' }) as TelemetryStats | null;

    const stats: TelemetryStats = existing || {
      total_requests: 0,
      cache_hits: 0,
      cache_misses: 0,
      total_tokens_in: 0,
      total_tokens_out: 0,
      total_tokens: 0,
      avg_latency_ms: 0,
      p95_latency_ms: 0,
      p99_latency_ms: 0,
      estimated_cost_usd: 0,
      period_start: hour * 3600000,
      period_end: (hour + 1) * 3600000,
      cache_hit_ratio: 0,
    };

    // 聚合新事件
    for (const event of events) {
      stats.total_requests++;
      if (event.cache_hit) stats.cache_hits++;
      if (event.cache_miss) stats.cache_misses++;
      stats.total_tokens_in += event.token_input || 0;
      stats.total_tokens_out += event.token_output || 0;
      stats.estimated_cost_usd += calculateCost(
        event.token_input || 0,
        event.token_output || 0
      );
    }

    stats.total_tokens = stats.total_tokens_in + stats.total_tokens_out;
    stats.cache_hit_ratio = stats.total_requests > 0
      ? stats.cache_hits / stats.total_requests
      : 0;

    // 保存 (7 天 TTL)
    await kv.put(key, JSON.stringify(stats), { expirationTtl: 7 * 24 * 3600 });
  } catch (error) {
    console.error(`[telemetry] Failed to update hourly metrics for ${hour}:`, error);
  }
}

/**
 * 更新最近事件
 */
async function updateRecentEvents(
  kv: KVStorage,
  events: TelemetryEvent[]
): Promise<void> {
  try {
    const existing = await kv.get(TELEMETRY_KEYS.RECENT, { type: 'json' }) as TelemetryEvent[] | null;
    const recent = existing ? [...existing, ...events] : [...events];

    // 只保留最近 100 条
    const trimmed = recent.slice(-100);

    await kv.put(TELEMETRY_KEYS.RECENT, JSON.stringify(trimmed), {
      expirationTtl: 3600, // 1 小时
    });
  } catch (error) {
    console.error('[telemetry] Failed to update recent events:', error);
  }
}

/**
 * 更新总计指标
 */
async function updateTotalMetrics(
  kv: KVStorage,
  events: TelemetryEvent[]
): Promise<void> {
  try {
    const existing = await kv.get(TELEMETRY_KEYS.TOTAL, { type: 'json' }) as TelemetryStats | null;

    if (!existing) return; // 总计通常通过聚合计算，不需要实时更新

    // 更新合计
    existing.total_requests += events.length;
    existing.cache_hits += events.filter(e => e.cache_hit).length;
    existing.cache_misses += events.filter(e => e.cache_miss).length;
    existing.total_tokens_in += events.reduce((sum, e) => sum + (e.token_input || 0), 0);
    existing.total_tokens_out += events.reduce((sum, e) => sum + (e.token_output || 0), 0);
    existing.total_tokens = existing.total_tokens_in + existing.total_tokens_out;
    existing.estimated_cost_usd += events.reduce((sum, e) =>
      sum + calculateCost(e.token_input || 0, e.token_output || 0), 0
    );
    existing.cache_hit_ratio = existing.total_requests > 0
      ? existing.cache_hits / existing.total_requests
      : 0;

    await kv.put(TELEMETRY_KEYS.TOTAL, JSON.stringify(existing));
  } catch (error) {
    console.error('[telemetry] Failed to update total metrics:', error);
  }
}

/**
 * 启动定时刷新
 */
function startFlushTimer(kv: KVStorage): void {
  if (flushTimer) return;

  flushTimer = setInterval(() => {
    flushBuffer(kv).catch(() => {});
  }, BUFFER_FLUSH_INTERVAL);
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * 获取指定时间范围的统计
 */
export async function getTelemetryStats(
  kv: KVStorage,
  period: '24h' | '7d' | '30d' | 'total'
): Promise<TelemetryStats> {
  const now = Date.now();
  let startHour: number;
  let numHours: number;

  switch (period) {
    case '24h':
      startHour = Math.floor((now - 24 * 3600000) / 3600000);
      numHours = 24;
      break;
    case '7d':
      startHour = Math.floor((now - 7 * 24 * 3600000) / 3600000);
      numHours = 7 * 24;
      break;
    case '30d':
      startHour = Math.floor((now - 30 * 24 * 3600000) / 3600000);
      numHours = 30 * 24;
      break;
    default:
      // 总计 - 从预先聚合的总计读取
      const total = await kv.get(TELEMETRY_KEYS.TOTAL, { type: 'json' }) as TelemetryStats | null;
      return total || createEmptyStats(now, now);
  }

  // 聚合小时级数据
  const stats = createEmptyStats(startHour * 3600000, now);

  for (let i = 0; i < numHours; i++) {
    const hour = startHour + i;
    try {
      const hourStats = await kv.get(TELEMETRY_KEYS.HOURLY(hour), { type: 'json' }) as TelemetryStats | null;
      if (hourStats) {
        stats.total_requests += hourStats.total_requests;
        stats.cache_hits += hourStats.cache_hits;
        stats.cache_misses += hourStats.cache_misses;
        stats.total_tokens_in += hourStats.total_tokens_in;
        stats.total_tokens_out += hourStats.total_tokens_out;
        stats.total_tokens += hourStats.total_tokens;
        stats.estimated_cost_usd += hourStats.estimated_cost_usd;
      }
    } catch {
      // 忽略单个小时的错误
    }
  }

  stats.total_tokens = stats.total_tokens_in + stats.total_tokens_out;
  stats.cache_hit_ratio = stats.total_requests > 0
    ? stats.cache_hits / stats.total_requests
    : 0;

  // 计算延迟百分位 (从最近事件采样)
  await calculatePercentiles(kv, stats, period);

  return stats;
}

/**
 * 获取最近事件
 */
export async function getRecentEvents(
  kv: KVStorage,
  limit: number = 50
): Promise<TelemetryEvent[]> {
  try {
    const events = await kv.get(TELEMETRY_KEYS.RECENT, { type: 'json' }) as TelemetryEvent[] | null;
    return events ? events.slice(-limit) : [];
  } catch {
    return [];
  }
}

/**
 * 计算延迟百分位
 */
async function calculatePercentiles(
  kv: KVStorage,
  stats: TelemetryStats,
  period: string
): Promise<void> {
  try {
    const events = await getRecentEvents(kv, 500);
    if (events.length === 0) return;

    // 按时间筛选
    const now = Date.now();
    let cutoff: number;
    switch (period) {
      case '24h':
        cutoff = now - 24 * 3600000;
        break;
      case '7d':
        cutoff = now - 7 * 24 * 3600000;
        break;
      case '30d':
        cutoff = now - 30 * 24 * 3600000;
        break;
      default:
        cutoff = 0;
    }

    const filtered = events.filter(e => e.timestamp >= cutoff);
    const latencies = filtered.map(e => e.latency_ms).sort((a, b) => a - b);

    if (latencies.length > 0) {
      stats.avg_latency_ms = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      stats.p95_latency_ms = latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1];
      stats.p99_latency_ms = latencies[Math.floor(latencies.length * 0.99)] || latencies[latencies.length - 1];
    }
  } catch (error) {
    console.error('[telemetry] Failed to calculate percentiles:', error);
  }
}

function createEmptyStats(start: number, end: number): TelemetryStats {
  return {
    total_requests: 0,
    cache_hits: 0,
    cache_misses: 0,
    total_tokens_in: 0,
    total_tokens_out: 0,
    total_tokens: 0,
    avg_latency_ms: 0,
    p95_latency_ms: 0,
    p99_latency_ms: 0,
    estimated_cost_usd: 0,
    period_start: start,
    period_end: end,
    cache_hit_ratio: 0,
  };
}

// ============================================================================
// Telemetry Wrapper
// ============================================================================

/**
 * 包装异步函数，自动记录遥测数据
 */
export function withTelemetry<T extends (...args: any[]) => Promise<any>>(
  kv: KVStorage,
  fn: T,
  options: {
    endpoint: string;
    estimateInputTokens?: (...args: Parameters<T>) => number;
    estimateOutputTokens?: (result: Awaited<ReturnType<T>>) => number;
    costConfig?: CostConfig;
  }
): T {
  return (async (...args: Parameters<T>) => {
    const startTime = Date.now();
    let cacheHit = false;
    let cacheMiss = false;
    let success = false;
    let error: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      // 估算输入 tokens
      if (options.estimateInputTokens) {
        inputTokens = options.estimateInputTokens(...args);
      }

      const result = await fn(...args);
      success = true;

      // 估算输出 tokens
      if (options.estimateOutputTokens) {
        outputTokens = options.estimateOutputTokens(result);
      }

      // 检查是否是缓存命中 (假设返回值有 cached 字段)
      if (result && typeof result === 'object' && 'cached' in result) {
        if (result.cached === true) {
          cacheHit = true;
        } else {
          cacheMiss = true;
        }
      }

      return result;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      const latency = Date.now() - startTime;

      // 异步记录 (不阻塞)
      recordTelemetry(kv, {
        timestamp: Date.now(),
        endpoint: options.endpoint,
        cache_hit: cacheHit,
        cache_miss: cacheMiss,
        token_input: inputTokens,
        token_output: outputTokens,
        latency_ms: latency,
        success,
        error,
      }).catch(() => {});
    }
  }) as T;
}

/**
 * 手动记录缓存命中
 */
export function recordCacheHit(kv: KVStorage, endpoint: string): void {
  recordTelemetry(kv, {
    timestamp: Date.now(),
    endpoint,
    cache_hit: true,
    cache_miss: false,
    latency_ms: 0,
    success: true,
  }).catch(() => {});
}

/**
 * 手动记录缓存未命中
 */
export function recordCacheMiss(kv: KVStorage, endpoint: string): void {
  recordTelemetry(kv, {
    timestamp: Date.now(),
    endpoint,
    cache_hit: false,
    cache_miss: true,
    latency_ms: 0,
    success: true,
  }).catch(() => {});
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * 刷新并关闭
 */
export async function shutdownTelemetry(kv: KVStorage): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushBuffer(kv);
}
