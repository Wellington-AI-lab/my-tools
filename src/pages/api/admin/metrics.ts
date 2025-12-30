/**
 * Admin Metrics API - 成本与效率监控
 *
 * GET /api/admin/metrics?period=24h|7d|30d|total
 *
 * 返回:
 * - Cache Hit Ratio (缓存命中率)
 * - Token Usage (输入/输出 tokens)
 * - Estimated Cost (USD 成本估算)
 * - Performance (平均/P95/P99 延迟)
 * - Recent Events (最近事件)
 *
 * 管理员权限检查通过 middleware 或环境变量实现
 */

import { requireKV } from '@/lib/env';
import { decodeSession } from '@/lib/session';
import { getSessionSecret } from '@/lib/auth';
import {
  getTelemetryStats,
  getRecentEvents,
  formatCost,
  calculateCost,
} from '@/modules/telemetry/wrapper';
import type { TelemetryStats } from '@/modules/telemetry/wrapper';
import type { KVStorage } from '@/lib/storage/kv';
import type { AstroCookies, APIRoute } from 'astro';

// ============================================================================
// Types
// ============================================================================

interface MetricsResponse {
  success: true;
  data: {
    period: string;
    summary: {
      total_requests: number;
      cache_hit_ratio: number;
      cache_hit_rate: string;  // "85%"
      total_tokens: number;
      estimated_cost_usd: number;
      estimated_cost_formatted: string;
    };
    performance: {
      avg_latency_ms: number;
      p95_latency_ms: number;
      p99_latency_ms: number;
      avg_latency_formatted: string;
    };
    tokens: {
      input: number;
      output: number;
      total: number;
    };
    cache: {
      hits: number;
      misses: number;
      ratio: number;
    };
    efficiency: {
      cost_per_1k_requests: number;
      tokens_per_request: number;
      savings_from_cache_usd: number;
    };
    recent_events: Array<{
      timestamp: number;
      endpoint: string;
      cache_hit: boolean;
      latency_ms: number;
      success: boolean;
    }>;
  };
  timestamp: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  timestamp: string;
}

// ============================================================================
// Admin Auth Check
// ============================================================================

/**
 * 强化管理员认证检查
 * 1. 优先检查 session 中的 role
 * 2. CRON_SECRET 用于内部调用
 * 3. 生产环境不允许绕过
 */
async function checkAdminAuth(opts: {
  cookies: AstroCookies;
  request: Request;
}): Promise<boolean> {
  const { cookies, request } = opts;

  // 方法 1: 检查 session (推荐)
  const signed = cookies.get('auth_session_data')?.value;
  if (signed) {
    try {
      const secret = getSessionSecret(process.env as Record<string, string | undefined>);
      const payload = await decodeSession(signed, secret);
      if (payload?.role === 'admin') {
        return true;
      }
    } catch {
      // Session 无效，继续检查其他方法
    }
  }

  // 方法 2: CRON_SECRET 内部调用 (用于 cron jobs)
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret && cronSecret === process.env.CRON_SECRET) {
    return true;
  }

  // 生产环境必须有有效认证
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  // 开发环境：仅本地请求允许
  const host = request.headers.get('host');
  return host?.startsWith('localhost') === true;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 格式化延迟
 */
function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 计算效率指标
 */
function calculateEfficiency(stats: TelemetryStats) {
  const costPer1kRequests = stats.total_requests > 0
    ? (stats.estimated_cost_usd / stats.total_requests) * 1000
    : 0;

  const tokensPerRequest = stats.total_requests > 0
    ? stats.total_tokens / stats.total_requests
    : 0;

  // 计算缓存节省的成本
  // 假设每次缓存命中节省了一次 LLM 调用
  const avgTokensPerRequest = tokensPerRequest || 1000; // 默认估算
  const cacheSavings = calculateCost(
    stats.cache_hits * avgTokensPerRequest * 0.7, // 70% 输入 tokens
    stats.cache_hits * avgTokensPerRequest * 0.3  // 30% 输出 tokens
  );

  return {
    cost_per_1k_requests: costPer1kRequests,
    tokens_per_request: Math.round(tokensPerRequest),
    savings_from_cache_usd: cacheSavings,
  };
}

/**
 * 获取时间范围描述
 */
function getPeriodLabel(period: string): string {
  switch (period) {
    case '24h': return 'Last 24 Hours';
    case '7d': return 'Last 7 Days';
    case '30d': return 'Last 30 Days';
    case 'total': return 'All Time';
    default: return period;
  }
}

// ============================================================================
// GET Handler
// ============================================================================

export async function GET({ locals, request, cookies }: {
  locals: App.Locals;
  request: Request;
  cookies: AstroCookies;
}) {
  // 1. 验证管理员权限
  if (!await checkAdminAuth({ cookies, request })) {
    return Response.json({
      success: false,
      error: 'Unauthorized: Valid admin credentials required',
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 401 });
  }

  const kv = requireKV(locals);

  // 2. 解析参数
  const url = new URL(request.url);
  const period = (url.searchParams.get('period') || '24h') as '24h' | '7d' | '30d' | 'total';
  const includeRecent = url.searchParams.get('recent') !== 'false';
  const recentLimit = parseInt(url.searchParams.get('limit') || '50');

  try {
    // 3. 获取统计数据
    const stats = await getTelemetryStats(kv, period);

    // 4. 获取最近事件
    let recentEvents: any[] = [];
    if (includeRecent) {
      const events = await getRecentEvents(kv, recentLimit);

      // 只返回必要字段，减少响应大小
      recentEvents = events.map(e => ({
        timestamp: e.timestamp,
        endpoint: e.endpoint,
        cache_hit: e.cache_hit,
        latency_ms: e.latency_ms,
        success: e.success,
      }));
    }

    // 5. 计算效率指标
    const efficiency = calculateEfficiency(stats);

    // 6. 构建响应
    const response: MetricsResponse = {
      success: true,
      data: {
        period: getPeriodLabel(period),
        summary: {
          total_requests: stats.total_requests,
          cache_hit_ratio: Math.round(stats.cache_hit_ratio * 1000) / 1000,
          cache_hit_rate: `${Math.round(stats.cache_hit_ratio * 100)}%`,
          total_tokens: stats.total_tokens,
          estimated_cost_usd: Math.round(stats.estimated_cost_usd * 10000) / 10000,
          estimated_cost_formatted: formatCost(stats.estimated_cost_usd),
        },
        performance: {
          avg_latency_ms: Math.round(stats.avg_latency_ms),
          p95_latency_ms: Math.round(stats.p95_latency_ms),
          p99_latency_ms: Math.round(stats.p99_latency_ms),
          avg_latency_formatted: formatLatency(stats.avg_latency_ms),
        },
        tokens: {
          input: stats.total_tokens_in,
          output: stats.total_tokens_out,
          total: stats.total_tokens,
        },
        cache: {
          hits: stats.cache_hits,
          misses: stats.cache_misses,
          ratio: Math.round(stats.cache_hit_ratio * 1000) / 1000,
        },
        efficiency: {
          cost_per_1k_requests: Math.round(efficiency.cost_per_1k_requests * 1000) / 1000,
          tokens_per_request: efficiency.tokens_per_request,
          savings_from_cache_usd: Math.round(efficiency.savings_from_cache_usd * 100) / 100,
        },
        recent_events: recentEvents,
      },
      timestamp: new Date().toISOString(),
    };

    return Response.json(response);
  } catch (error: any) {
    console.error('[api/admin/metrics] Error:', error);

    return Response.json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 500 });
  }
}

/**
 * OPTIONS handler for CORS with origin whitelist
 */
export async function OPTIONS({ request }: { request: Request }) {
  const origin = request.headers.get('origin');

  // 允许的源列表 (环境变量配置)
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'https://my-tools-bim.pages.dev')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const isAllowed = origin && allowedOrigins.includes(origin);

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // 24 hours
  };

  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }

  return new Response(null, { status: 204, headers });
}
