/**
 * 测试文件：metrics.test.ts
 * 覆盖模块：src/pages/api/admin/metrics.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, OPTIONS } from './metrics';
import type { KVStorage } from '@/lib/storage/kv';
import type { TelemetryStats, TelemetryEvent } from '@/modules/telemetry/wrapper';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockKV(): KVStorage {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockLocals(kv?: KVStorage): App.Locals {
  return {
    runtime: {
      env: {},
    },
  } as App.Locals;
}

function createMockRequest(url: string, headers: Record<string, string> = {}): Request {
  return {
    url,
    headers: {
      get: vi.fn((name: string) => headers[name?.toLowerCase()] || null),
    },
  } as any;
}

// ============================================================================
// Process.env Mocking
// ============================================================================

const originalEnv = process.env;

function mockEnv(env: Partial<NodeJS.ProcessEnv>) {
  process.env = { ...originalEnv, ...env } as any;
}

function resetEnv() {
  process.env = originalEnv;
}

// ============================================================================
// Mock Telemetry Module
// ============================================================================

vi.mock('@/modules/telemetry/wrapper', () => ({
  getTelemetryStats: vi.fn(),
  getRecentEvents: vi.fn(),
  formatCost: vi.fn((cost: number) => `$${cost.toFixed(4)}`),
  calculateCost: vi.fn((input: number, output: number) => {
    const inputCost = (input / 1_000_000) * 2.5;
    const outputCost = (output / 1_000_000) * 10.0;
    return inputCost + outputCost;
  }),
}));

import { getTelemetryStats, getRecentEvents } from '@/modules/telemetry/wrapper';

// ============================================================================
// Mock Env Module
// ============================================================================

vi.mock('@/lib/env', () => ({
  requireKV: vi.fn((locals: App.Locals) => mockKV),
}));

import { requireKV } from '@/lib/env';

let mockKV: KVStorage;

// ============================================================================
// GET Tests - Authentication
// ============================================================================
describe('GET /api/admin/metrics - Authentication', () => {
  beforeEach(() => {
    mockKV = createMockKV();
    vi.mocked(requireKV).mockReturnValue(mockKV);
  });

  afterEach(() => {
    resetEnv();
    vi.clearAllMocks();
  });

  describe('Unauthorized Access', () => {
    it('should_return_401_when_no_auth_provided', async () => {
      // Arrange
      mockEnv({ NODE_ENV: 'production', ADMIN_SECRET: 'super-secret' });
      const request = createMockRequest('https://example.com/api/admin/metrics');
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('should_return_401_when_wrong_admin_secret', async () => {
      // Arrange
      mockEnv({ NODE_ENV: 'production', ADMIN_SECRET: 'super-secret' });
      const request = createMockRequest('https://example.com/api/admin/metrics', {
        'x-admin-secret': 'wrong-secret',
      });
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should_return_401_when_wrong_bearer_token', async () => {
      // Arrange
      mockEnv({ NODE_ENV: 'production', ADMIN_SECRET: 'super-secret' });
      const request = createMockRequest('https://example.com/api/admin/metrics', {
        authorization: 'Bearer wrong-token',
      });
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });
  });

  describe('Authorized Access', () => {
    it('should_allow_access_with_correct_x_admin_secret', async () => {
      // Arrange
      mockEnv({ NODE_ENV: 'production', ADMIN_SECRET: 'super-secret' });
      vi.mocked(getTelemetryStats).mockResolvedValue(createEmptyStats());
      vi.mocked(getRecentEvents).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/admin/metrics', {
        'x-admin-secret': 'super-secret',
      });
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should_allow_access_with_correct_bearer_token', async () => {
      // Arrange
      mockEnv({ NODE_ENV: 'production', ADMIN_SECRET: 'super-secret' });
      vi.mocked(getTelemetryStats).mockResolvedValue(createEmptyStats());
      vi.mocked(getRecentEvents).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/admin/metrics', {
        authorization: 'Bearer super-secret',
      });
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should_allow_access_in_development_mode_without_auth', async () => {
      // Arrange
      mockEnv({ NODE_ENV: 'development' });
      vi.mocked(getTelemetryStats).mockResolvedValue(createEmptyStats());
      vi.mocked(getRecentEvents).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/admin/metrics');
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});

// ============================================================================
// GET Tests - Query Parameters
// ============================================================================
describe('GET /api/admin/metrics - Query Parameters', () => {
  beforeEach(() => {
    mockKV = createMockKV();
    vi.mocked(requireKV).mockReturnValue(mockKV);
    mockEnv({ NODE_ENV: 'development' });
  });

  afterEach(() => {
    resetEnv();
    vi.clearAllMocks();
  });

  describe('Period Parameter', () => {
    it('should_use_24h_as_default_period', async () => {
      // Arrange
      const stats = createEmptyStats();
      vi.mocked(getTelemetryStats).mockResolvedValue(stats);
      vi.mocked(getRecentEvents).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/admin/metrics');
      const locals = createMockLocals(mockKV);

      // Act
      await GET({ locals, request });

      // Assert
      expect(getTelemetryStats).toHaveBeenCalledWith(mockKV, '24h');
    });

    it('should_accept_24h_period', async () => {
      // Arrange
      const stats = createEmptyStats();
      vi.mocked(getTelemetryStats).mockResolvedValue(stats);
      vi.mocked(getRecentEvents).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/admin/metrics?period=24h');
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(getTelemetryStats).toHaveBeenCalledWith(mockKV, '24h');
      expect(data.data.period).toBe('Last 24 Hours');
    });

    it('should_accept_7d_period', async () => {
      // Arrange
      const stats = createEmptyStats();
      vi.mocked(getTelemetryStats).mockResolvedValue(stats);
      vi.mocked(getRecentEvents).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/admin/metrics?period=7d');
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(getTelemetryStats).toHaveBeenCalledWith(mockKV, '7d');
      expect(data.data.period).toBe('Last 7 Days');
    });

    it('should_accept_30d_period', async () => {
      // Arrange
      const stats = createEmptyStats();
      vi.mocked(getTelemetryStats).mockResolvedValue(stats);
      vi.mocked(getRecentEvents).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/admin/metrics?period=30d');
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(getTelemetryStats).toHaveBeenCalledWith(mockKV, '30d');
      expect(data.data.period).toBe('Last 30 Days');
    });

    it('should_accept_total_period', async () => {
      // Arrange
      const stats = createEmptyStats();
      vi.mocked(getTelemetryStats).mockResolvedValue(stats);
      vi.mocked(getRecentEvents).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/admin/metrics?period=total');
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(getTelemetryStats).toHaveBeenCalledWith(mockKV, 'total');
      expect(data.data.period).toBe('All Time');
    });
  });

  describe('Recent Events Parameter', () => {
    it('should_include_recent_events_by_default', async () => {
      // Arrange
      const stats = createEmptyStats();
      const events: TelemetryEvent[] = [
        {
          timestamp: Date.now(),
          endpoint: 'test',
          cache_hit: true,
          cache_miss: false,
          latency_ms: 100,
          success: true,
        },
      ];
      vi.mocked(getTelemetryStats).mockResolvedValue(stats);
      vi.mocked(getRecentEvents).mockResolvedValue(events);

      const request = createMockRequest('https://example.com/api/admin/metrics');
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(getRecentEvents).toHaveBeenCalledWith(mockKV, 50);
      // API only returns specific fields: timestamp, endpoint, cache_hit, latency_ms, success
      expect(data.data.recent_events).toEqual([
        {
          timestamp: events[0].timestamp,
          endpoint: events[0].endpoint,
          cache_hit: events[0].cache_hit,
          latency_ms: events[0].latency_ms,
          success: events[0].success,
        },
      ]);
    });

    it('should_exclude_recent_events_when_recent_is_false', async () => {
      // Arrange
      const stats = createEmptyStats();
      vi.mocked(getTelemetryStats).mockResolvedValue(stats);

      const request = createMockRequest('https://example.com/api/admin/metrics?recent=false');
      const locals = createMockLocals(mockKV);

      // Act
      const response = await GET({ locals, request });
      const data = await response.json();

      // Assert
      expect(getRecentEvents).not.toHaveBeenCalled();
      expect(data.data.recent_events).toEqual([]);
    });

    it('should_use_custom_limit_for_recent_events', async () => {
      // Arrange
      const stats = createEmptyStats();
      vi.mocked(getTelemetryStats).mockResolvedValue(stats);
      vi.mocked(getRecentEvents).mockResolvedValue([]);

      const request = createMockRequest('https://example.com/api/admin/metrics?limit=100');
      const locals = createMockLocals(mockKV);

      // Act
      await GET({ locals, request });

      // Assert
      expect(getRecentEvents).toHaveBeenCalledWith(mockKV, 100);
    });
  });
});

// ============================================================================
// GET Tests - Response Structure
// ============================================================================
describe('GET /api/admin/metrics - Response Structure', () => {
  beforeEach(() => {
    mockKV = createMockKV();
    vi.mocked(requireKV).mockReturnValue(mockKV);
    mockEnv({ NODE_ENV: 'development' });
  });

  afterEach(() => {
    resetEnv();
    vi.clearAllMocks();
  });

  it('should_return_complete_metrics_response', async () => {
    // Arrange
    const stats: TelemetryStats = {
      total_requests: 1000,
      cache_hits: 700,
      cache_misses: 300,
      total_tokens_in: 50000,
      total_tokens_out: 20000,
      total_tokens: 70000,
      avg_latency_ms: 150,
      p95_latency_ms: 300,
      p99_latency_ms: 500,
      estimated_cost_usd: 0.15,
      period_start: Date.now() - 86400000,
      period_end: Date.now(),
      cache_hit_ratio: 0.7,
    };

    vi.mocked(getTelemetryStats).mockResolvedValue(stats);
    vi.mocked(getRecentEvents).mockResolvedValue([]);

    const request = createMockRequest('https://example.com/api/admin/metrics');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(data.success).toBe(true);
    expect(data.data).toMatchObject({
      period: 'Last 24 Hours',
      summary: {
        total_requests: 1000,
        cache_hit_ratio: 0.7,
        cache_hit_rate: '70%',
        total_tokens: 70000,
        estimated_cost_usd: 0.15,
      },
      tokens: {
        input: 50000,
        output: 20000,
        total: 70000,
      },
      cache: {
        hits: 700,
        misses: 300,
        ratio: 0.7,
      },
    });
    expect(data.timestamp).toBeDefined();
  });

  it('should_calculate_efficiency_metrics', async () => {
    // Arrange
    const stats: TelemetryStats = {
      total_requests: 1000,
      cache_hits: 700,
      cache_misses: 300,
      total_tokens_in: 50000,
      total_tokens_out: 20000,
      total_tokens: 70000,
      avg_latency_ms: 150,
      p95_latency_ms: 300,
      p99_latency_ms: 500,
      estimated_cost_usd: 0.15,
      period_start: Date.now() - 86400000,
      period_end: Date.now(),
      cache_hit_ratio: 0.7,
    };

    vi.mocked(getTelemetryStats).mockResolvedValue(stats);
    vi.mocked(getRecentEvents).mockResolvedValue([]);

    const request = createMockRequest('https://example.com/api/admin/metrics');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(data.data.efficiency).toMatchObject({
      cost_per_1k_requests: expect.any(Number),
      tokens_per_request: 70,
      savings_from_cache_usd: expect.any(Number),
    });
  });

  it('should_include_performance_metrics', async () => {
    // Arrange
    const stats: TelemetryStats = {
      total_requests: 1000,
      cache_hits: 700,
      cache_misses: 300,
      total_tokens_in: 50000,
      total_tokens_out: 20000,
      total_tokens: 70000,
      avg_latency_ms: 1500,
      p95_latency_ms: 3000,
      p99_latency_ms: 5000,
      estimated_cost_usd: 0.15,
      period_start: Date.now() - 86400000,
      period_end: Date.now(),
      cache_hit_ratio: 0.7,
    };

    vi.mocked(getTelemetryStats).mockResolvedValue(stats);
    vi.mocked(getRecentEvents).mockResolvedValue([]);

    const request = createMockRequest('https://example.com/api/admin/metrics');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(data.data.performance).toMatchObject({
      avg_latency_ms: 1500,
      p95_latency_ms: 3000,
      p99_latency_ms: 5000,
      avg_latency_formatted: '1.5s',
    });
  });

  it('should_format_latency_correctly', async () => {
    // Arrange
    const stats: TelemetryStats = {
      ...createEmptyStats(),
      avg_latency_ms: 500,
    };

    vi.mocked(getTelemetryStats).mockResolvedValue(stats);
    vi.mocked(getRecentEvents).mockResolvedValue([]);

    const request = createMockRequest('https://example.com/api/admin/metrics');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(data.data.performance.avg_latency_formatted).toBe('500ms');
  });
});

// ============================================================================
// GET Tests - Recent Events
// ============================================================================
describe('GET /api/admin/metrics - Recent Events', () => {
  beforeEach(() => {
    mockKV = createMockKV();
    vi.mocked(requireKV).mockReturnValue(mockKV);
    mockEnv({ NODE_ENV: 'development' });
  });

  afterEach(() => {
    resetEnv();
    vi.clearAllMocks();
  });

  it('should_include_recent_events_with_required_fields', async () => {
    // Arrange
    const events: TelemetryEvent[] = [
      {
        timestamp: 1704067200000,
        endpoint: '/api/news/feed',
        cache_hit: true,
        cache_miss: false,
        latency_ms: 150,
        success: true,
      },
      {
        timestamp: 1704067260000,
        endpoint: '/api/news/summarize',
        cache_hit: false,
        cache_miss: true,
        latency_ms: 500,
        success: true,
      },
      {
        timestamp: 1704067320000,
        endpoint: '/api/intelligence/scan',
        cache_hit: false,
        cache_miss: true,
        latency_ms: 200,
        success: false,
        error: 'Timeout',
      },
    ];

    vi.mocked(getTelemetryStats).mockResolvedValue(createEmptyStats());
    vi.mocked(getRecentEvents).mockResolvedValue(events);

    const request = createMockRequest('https://example.com/api/admin/metrics');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(data.data.recent_events).toHaveLength(3);
    expect(data.data.recent_events[0]).toMatchObject({
      timestamp: 1704067200000,
      endpoint: '/api/news/feed',
      cache_hit: true,
      latency_ms: 150,
      success: true,
    });
    expect(data.data.recent_events[2]).toMatchObject({
      success: false,
    });
  });

  it('should_limit_recent_events_to_specified_limit', async () => {
    // Arrange
    const events: TelemetryEvent[] = Array.from({ length: 100 }, (_, i) => ({
      timestamp: Date.now() - i * 1000,
      endpoint: `/api/test/${i}`,
      cache_hit: i % 2 === 0,
      cache_miss: i % 2 !== 0,
      latency_ms: 100 + i,
      success: true,
    }));

    vi.mocked(getTelemetryStats).mockResolvedValue(createEmptyStats());
    vi.mocked(getRecentEvents).mockResolvedValue(events);

    const request = createMockRequest('https://example.com/api/admin/metrics?limit=10');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(getRecentEvents).toHaveBeenCalledWith(mockKV, 10);
    expect(data.data.recent_events).toHaveLength(100); // getRecentEvents returns all 100
  });
});

// ============================================================================
// GET Tests - Error Handling
// ============================================================================
describe('GET /api/admin/metrics - Error Handling', () => {
  beforeEach(() => {
    mockKV = createMockKV();
    vi.mocked(requireKV).mockReturnValue(mockKV);
    mockEnv({ NODE_ENV: 'development' });
  });

  afterEach(() => {
    resetEnv();
    vi.clearAllMocks();
  });

  it('should_return_500_when_getTelemetryStats_throws', async () => {
    // Arrange
    vi.mocked(getTelemetryStats).mockRejectedValue(new Error('Database connection failed'));

    const request = createMockRequest('https://example.com/api/admin/metrics');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Database connection failed');
  });

  it('should_handle_getTelemetryStats_returning_null', async () => {
    // Arrange
    vi.mocked(getTelemetryStats).mockResolvedValue(null as any);
    vi.mocked(getRecentEvents).mockResolvedValue([]);

    const request = createMockRequest('https://example.com/api/admin/metrics?period=total');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert - API returns 500 when stats is null because calculateEfficiency tries to access properties on null
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  it('should_return_500_when_getRecentEvents_throws', async () => {
    // Arrange
    vi.mocked(getTelemetryStats).mockResolvedValue(createEmptyStats());
    vi.mocked(getRecentEvents).mockRejectedValue(new Error('Recent events fetch failed'));

    const request = createMockRequest('https://example.com/api/admin/metrics');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });
});

// ============================================================================
// OPTIONS Tests
// ============================================================================
describe('OPTIONS /api/admin/metrics', () => {
  it('should_return_cors_headers', async () => {
    // Act
    const response = await OPTIONS();

    // Assert
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Admin-Secret');
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createEmptyStats(): TelemetryStats {
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
    period_start: Date.now() - 86400000,
    period_end: Date.now(),
    cache_hit_ratio: 0,
  };
}
