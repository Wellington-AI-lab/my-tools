/**
 * 测试文件：calculate.test.ts
 * 覆盖模块：src/pages/api/stocks/calculate.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './calculate';

// ============================================================================
// Mock Helpers
// ============================================================================

interface MockKV {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

function createMockKV(): MockKV {
  return {
    get: vi.fn(),
    put: vi.fn(),
  };
}

function createMockLocals(overrides = {}) {
  return {
    runtime: {
      env: {
        FINNHUB_API_KEY: 'test-finnhub-key',
        FMP_API_KEY: 'test-fmp-key',
        POLYGON_API_KEY: 'test-polygon-key',
        KV: createMockKV(),
        ...overrides,
      },
    },
  };
}

function createMockRequest(body: any) {
  return {
    json: vi.fn(() => Promise.resolve(body)),
  };
}

function createMockUrl(protocol: 'https:' | 'http:' = 'https:') {
  return { protocol };
}

// Mock the modules
vi.mock('@/modules/stocks/providers', () => ({
  fetchDailySeriesWithCache: vi.fn(),
}));

vi.mock('@/modules/stocks/backtest', () => ({
  runBacktest: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  getEnv: vi.fn((locals) => locals.runtime.env),
  getKV: vi.fn((locals) => locals.runtime.env.KV),
}));

vi.mock('@/lib/validation', () => ({
  normalizeAndValidateSymbol: vi.fn((s) => s.toUpperCase()),
}));

import { fetchDailySeriesWithCache } from '@/modules/stocks/providers';
import { runBacktest } from '@/modules/stocks/backtest';
import { getEnv, getKV } from '@/lib/env';
import { normalizeAndValidateSymbol } from '@/lib/validation';

const mockedFetchDailySeriesWithCache = fetchDailySeriesWithCache as unknown as ReturnType<typeof vi.fn>;
const mockedRunBacktest = runBacktest as unknown as ReturnType<typeof vi.fn>;
const mockedGetEnv = getEnv as unknown as ReturnType<typeof vi.fn>;
const mockedGetKV = getKV as unknown as ReturnType<typeof vi.fn>;
const mockedNormalizeAndValidateSymbol = normalizeAndValidateSymbol as unknown as ReturnType<typeof vi.fn>;

// ============================================================================
// Happy Path Tests
// ============================================================================
describe('POST /api/stocks/calculate - Happy Path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnv.mockImplementation((locals) => locals.runtime.env);
    mockedGetKV.mockImplementation((locals) => locals.runtime.env.KV);
    mockedNormalizeAndValidateSymbol.mockImplementation((s) => s.toUpperCase());

    // Default mock for fetchDailySeriesWithCache
    mockedFetchDailySeriesWithCache.mockResolvedValue({
      points: [
        { date: '2024-01-01', close: 100 },
        { date: '2024-01-02', close: 101 },
        { date: '2024-01-03', close: 102 },
      ],
      provider: 'yahoo',
      cacheHit: false,
    });

    // Default mock for runBacktest - preserve notes passed to it
    mockedRunBacktest.mockImplementation((opts: any) => ({
      cagr: 15.5,
      totalReturn: 50.0,
      maxDrawdown: -10.5,
      sharpeRatio: 1.2,
      actualStartDate: '2024-01-01',
      actualEndDate: '2024-12-31',
      providerBySymbol: { AAPL: 'yahoo', MSFT: 'yahoo' },
      notes: opts.notes || [],
      valueSeries: [
        { date: '2024-01-01', value: 1 },
        { date: '2024-12-31', value: 1.5 },
      ],
      maxDrawdownInfo: {
        peakDate: '2024-01-15',
        troughDate: '2024-02-01',
        recoveryDate: '2024-02-15',
        drawdownPct: -10.5,
      },
      entryEvents: [],
    }));
  });

  it('should_return_successful_backtest_result', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockKV.get.mockResolvedValue(null);

    const locals = createMockLocals({ KV: mockKV });
    const request = createMockRequest({
      weights: [
        { symbol: 'AAPL', weight: 0.6 },
        { symbol: 'MSFT', weight: 0.4 },
      ],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.cagr).toBe(15.5);
    expect(json.totalReturn).toBe(50.0);
    expect(json.maxDrawdown).toBe(-10.5);
    expect(json.sharpeRatio).toBe(1.2);
  });

  it('should_call_fetch_with_correct_parameters', async () => {
    // Arrange
    const mockKV = createMockKV();
    const locals = createMockLocals({ KV: mockKV });
    const request = createMockRequest({
      weights: [
        { symbol: 'AAPL', weight: 1 },
      ],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    await POST({ locals, request, url } as any);

    // Assert
    expect(mockedFetchDailySeriesWithCache).toHaveBeenCalledWith({
      kv: mockKV,
      env: locals.runtime.env,
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-12-31',
      providers: ['yahoo', 'finnhub', 'fmp', 'polygon'],
    });
  });

  it('should_normalize_symbols', async () => {
    // Arrange
    mockedNormalizeAndValidateSymbol.mockImplementation((s) => s.toUpperCase());
    const mockKV = createMockKV();
    const locals = createMockLocals({ KV: mockKV });
    const request = createMockRequest({
      weights: [
        { symbol: 'aapl', weight: 0.5 },
        { symbol: 'msft', weight: 0.5 },
      ],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    await POST({ locals, request, url } as any);

    // Assert
    expect(mockedNormalizeAndValidateSymbol).toHaveBeenCalledWith('aapl');
    expect(mockedNormalizeAndValidateSymbol).toHaveBeenCalledWith('msft');
    expect(mockedFetchDailySeriesWithCache).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'AAPL',
      })
    );
  });

  it('should_include_kv_cache_status_in_notes', async () => {
    // Arrange
    const mockKV = createMockKV();
    // Mock cache hit: kvGetJson calls kv.get with text option
    mockKV.get.mockImplementation(async (_key: string, opts: any) => {
      if (opts?.type === 'text') {
        return JSON.stringify([
          { date: '2024-01-01', close: 100 },
        ]);
      }
      return null;
    });

    const locals = createMockLocals({ KV: mockKV });
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);
    const json = await response.json();

    // Assert - Note format is "KV 缓存命中：X/Y"
    expect(json.notes.some((note: string) => note.includes('KV 缓存命中'))).toBe(true);
  });

  it('should_fetch_benchmark_when_available', async () => {
    // Arrange
    const mockKV = createMockKV();
    const locals = createMockLocals({ KV: mockKV });
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    await POST({ locals, request, url } as any);

    // Assert - Should have fetched QQQ benchmark
    const calls = mockedFetchDailySeriesWithCache.mock.calls;
    const benchmarkCall = calls.find((call: any[]) => call[0].symbol === 'QQQ');
    expect(benchmarkCall).toBeDefined();
  });

  it('should_handle_benchmark_failure_gracefully', async () => {
    // Arrange
    const mockKV = createMockKV();
    const locals = createMockLocals({ KV: mockKV });
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Mock benchmark fetch to fail
    mockedFetchDailySeriesWithCache.mockImplementation(({ symbol }: any) => {
      if (symbol === 'QQQ') {
        throw new Error('Benchmark fetch failed');
      }
      return {
        points: [{ date: '2024-01-01', close: 100 }],
        provider: 'yahoo',
        cacheHit: false,
      };
    });

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert - Should still return 200
    expect(response.status).toBe(200);
  });
});

// ============================================================================
// Input Validation Tests
// ============================================================================
describe('POST /api/stocks/calculate - Input Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnv.mockImplementation((locals) => locals.runtime.env);
    mockedGetKV.mockImplementation((locals) => locals.runtime.env.KV);
    mockedNormalizeAndValidateSymbol.mockImplementation((s) => s.toUpperCase());
  });

  it('should_return_400_for_missing_body', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = {
      json: vi.fn(() => Promise.reject(new Error('Invalid JSON'))),
    };
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Invalid request');
  });

  it('should_return_400_for_missing_weights', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(400);
  });

  it('should_return_400_for_missing_dates', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(400);
  });

  it('should_return_400_for_invalid_date_format', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024/01/01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(400);
  });

  it('should_return_400_for_invalid_date_feb_30', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-02-30', // Invalid date
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(400);
  });

  it('should_return_400_for_start_date_before_min', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '1999-12-31',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('开始日期不能早于 2000-01-01');
  });

  it('should_return_400_for_end_date_before_min', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '1999-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('结束日期不能早于');
  });

  it('should_return_400_for_start_after_end', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-12-31',
      endDate: '2024-01-01',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('startDate must be <= endDate');
  });

  it('should_return_400_for_negative_weight', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: -1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(400);
  });

  it('should_return_400_for_infinite_weight', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: Infinity }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(400);
  });

  it('should_return_400_for_no_valid_symbols', async () => {
    // Arrange
    mockedNormalizeAndValidateSymbol.mockReturnValue(null);
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'INVALID', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('At least one valid symbol');
  });

  it('should_filter_out_invalid_symbols', async () => {
    // Arrange
    mockedNormalizeAndValidateSymbol.mockImplementation((s) =>
      s === 'VALID' ? 'VALID' : null
    );
    mockedFetchDailySeriesWithCache.mockResolvedValue({
      points: [{ date: '2024-01-01', close: 100 }],
      provider: 'yahoo',
      cacheHit: false,
    });
    mockedRunBacktest.mockReturnValue({
      cagr: 10,
      totalReturn: 10,
      maxDrawdown: 0,
      sharpeRatio: 1,
      actualStartDate: '2024-01-01',
      actualEndDate: '2024-12-31',
      providerBySymbol: {},
      notes: [],
      valueSeries: [],
      maxDrawdownInfo: {
        peakDate: '',
        troughDate: '',
        recoveryDate: null,
        drawdownPct: 0,
      },
      entryEvents: [],
    });

    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [
        { symbol: 'VALID', weight: 0.5 },
        { symbol: 'INVALID1', weight: 0.25 },
        { symbol: 'INVALID2', weight: 0.25 },
      ],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert - Should succeed with only the valid symbol
    expect(response.status).toBe(200);
    expect(mockedFetchDailySeriesWithCache).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'VALID',
      })
    );
  });
});

// ============================================================================
// Backtest Integration Tests
// ============================================================================
describe('POST /api/stocks/calculate - Backtest Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnv.mockImplementation((locals) => locals.runtime.env);
    mockedGetKV.mockImplementation((locals) => locals.runtime.env.KV);
    mockedNormalizeAndValidateSymbol.mockImplementation((s) => s.toUpperCase());

    mockedFetchDailySeriesWithCache.mockResolvedValue({
      points: [
        { date: '2024-01-01', close: 100 },
        { date: '2024-01-02', close: 101 },
        { date: '2024-01-03', close: 102 },
      ],
      provider: 'yahoo',
      cacheHit: false,
    });
  });

  it('should_pass_clamp_years_to_backtest', async () => {
    // Arrange
    const mockKV = createMockKV();
    const locals = createMockLocals({ KV: mockKV });
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2000-01-01', // At MIN_DATE boundary
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    await POST({ locals, request, url } as any);

    // Assert - clampYears is hardcoded to 30 in the API
    expect(mockedRunBacktest).toHaveBeenCalledWith(
      expect.objectContaining({
        clampYears: 30,
      })
    );
  });

  it('should_include_notes_in_response', async () => {
    // Arrange
    const mockKV = createMockKV();
    const backtestNotes = ['Note from backtest'];
    mockedRunBacktest.mockImplementation((opts: any) => ({
      cagr: 10,
      totalReturn: 10,
      maxDrawdown: 0,
      sharpeRatio: 1,
      actualStartDate: '2024-01-01',
      actualEndDate: '2024-12-31',
      providerBySymbol: {},
      notes: [...(opts.notes || []), ...backtestNotes], // Merge API notes with backtest notes
      valueSeries: [],
      maxDrawdownInfo: {
        peakDate: '',
        troughDate: '',
        recoveryDate: null,
        drawdownPct: 0,
      },
      entryEvents: [],
    }));

    const locals = createMockLocals({ KV: mockKV });
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);
    const json = await response.json();

    // Assert - API merges backtest notes with its own notes
    expect(json.notes).toContain('Note from backtest');
    expect(json.notes.some((note: string) => note.includes('KV 缓存命中'))).toBe(true);
  });

  it('should_include_entry_events_in_response', async () => {
    // Arrange
    const mockKV = createMockKV();
    const mockEntryEvents = [
      { date: '2024-01-01', symbol: 'AAPL' },
      { date: '2024-02-01', symbol: 'MSFT' },
    ];
    mockedRunBacktest.mockReturnValue({
      cagr: 10,
      totalReturn: 10,
      maxDrawdown: 0,
      sharpeRatio: 1,
      actualStartDate: '2024-01-01',
      actualEndDate: '2024-12-31',
      providerBySymbol: {},
      notes: [],
      valueSeries: [],
      maxDrawdownInfo: {
        peakDate: '',
        troughDate: '',
        recoveryDate: null,
        drawdownPct: 0,
      },
      entryEvents: mockEntryEvents,
    });

    const locals = createMockLocals({ KV: mockKV });
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);
    const json = await response.json();

    // Assert
    expect(json.entryEvents).toEqual(mockEntryEvents);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================
describe('POST /api/stocks/calculate - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnv.mockImplementation((locals) => locals.runtime.env);
    mockedGetKV.mockImplementation((locals) => locals.runtime.env.KV);
    mockedNormalizeAndValidateSymbol.mockImplementation((s) => s.toUpperCase());
  });

  it('should_return_500_when_backtest_throws', async () => {
    // Arrange
    mockedFetchDailySeriesWithCache.mockResolvedValue({
      points: [{ date: '2024-01-01', close: 100 }],
      provider: 'yahoo',
      cacheHit: false,
    });
    mockedRunBacktest.mockImplementation(() => {
      throw new Error('Backtest calculation failed');
    });

    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toContain('Backtest calculation failed');
  });

  it('should_return_500_when_fetch_fails', async () => {
    // Arrange
    mockedFetchDailySeriesWithCache.mockRejectedValue(
      new Error('All providers failed for AAPL')
    );

    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toContain('All providers failed');
  });

  it('should_return_json_content_type_on_error', async () => {
    // Arrange
    mockedFetchDailySeriesWithCache.mockRejectedValue(new Error('Test error'));

    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.headers.get('content-type')).toBe('application/json');
  });
});

// ============================================================================
// KV Unavailable Tests
// ============================================================================
describe('POST /api/stocks/calculate - KV Unavailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnv.mockImplementation((locals) => locals.runtime.env);
    mockedGetKV.mockImplementation((locals) => locals.runtime.env.KV);
    mockedNormalizeAndValidateSymbol.mockImplementation((s) => s.toUpperCase());

    mockedFetchDailySeriesWithCache.mockResolvedValue({
      points: [{ date: '2024-01-01', close: 100 }],
      provider: 'yahoo',
      cacheHit: false,
    });

    mockedRunBacktest.mockImplementation((opts: any) => ({
      cagr: 10,
      totalReturn: 10,
      maxDrawdown: 0,
      sharpeRatio: 1,
      actualStartDate: '2024-01-01',
      actualEndDate: '2024-12-31',
      providerBySymbol: {},
      notes: opts.notes || [],
      valueSeries: [],
      maxDrawdownInfo: {
        peakDate: '',
        troughDate: '',
        recoveryDate: null,
        drawdownPct: 0,
      },
      entryEvents: [],
    }));
  });

  it('should_work_when_kv_is_null', async () => {
    // Arrange
    const locals = createMockLocals({ KV: null });
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.notes.some((note: string) => note.includes('KV 未绑定'))).toBe(true);
  });

  it('should_include_no_cache_message_in_notes', async () => {
    // Arrange
    const locals = createMockLocals({ KV: null });
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);
    const json = await response.json();

    // Assert - Note is "KV 未绑定：当前为无缓存模式（开发环境可接受，生产建议绑定 KV）。"
    expect(json.notes.some((note: string) => note.includes('无缓存模式'))).toBe(true);
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================
describe('POST /api/stocks/calculate - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnv.mockImplementation((locals) => locals.runtime.env);
    mockedGetKV.mockImplementation((locals) => locals.runtime.env.KV);
    mockedNormalizeAndValidateSymbol.mockImplementation((s) => s.toUpperCase());

    mockedFetchDailySeriesWithCache.mockResolvedValue({
      points: [{ date: '2024-01-01', close: 100 }],
      provider: 'yahoo',
      cacheHit: false,
    });

    mockedRunBacktest.mockImplementation((opts: any) => ({
      cagr: 10,
      totalReturn: 10,
      maxDrawdown: 0,
      sharpeRatio: 1,
      actualStartDate: '2024-01-01',
      actualEndDate: '2024-12-31',
      providerBySymbol: {},
      notes: opts.notes || [],
      valueSeries: [],
      maxDrawdownInfo: {
        peakDate: '',
        troughDate: '',
        recoveryDate: null,
        drawdownPct: 0,
      },
      entryEvents: [],
    }));
  });

  it('should_handle_zero_weight_symbol', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [
        { symbol: 'AAPL', weight: 0 },
        { symbol: 'MSFT', weight: 1 },
      ],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert - API uses weight >= 0 for filtering, so AAPL is included
    expect(response.status).toBe(200);
    // Both AAPL (weight 0) and MSFT (weight 1) are fetched + QQQ benchmark = 3 calls
    expect(mockedFetchDailySeriesWithCache).toHaveBeenCalledTimes(3);
  });

  it('should_handle_very_large_portfolio', async () => {
    // Arrange
    const symbols = Array.from({ length: 50 }, (_, i) => `STK${i}`);
    const weights = symbols.map(s => ({ symbol: s, weight: 1 }));

    const locals = createMockLocals();
    const request = createMockRequest({
      weights,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert - 50 symbols + 1 QQQ benchmark = 51 calls
    expect(response.status).toBe(200);
    expect(mockedFetchDailySeriesWithCache).toHaveBeenCalledTimes(51);
  });

  it('should_handle_exact_min_date', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2000-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_handle_same_start_and_end_date', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [{ symbol: 'AAPL', weight: 1 }],
      startDate: '2024-01-01',
      endDate: '2024-01-01',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_normalize_empty_string_symbol', async () => {
    // Arrange
    mockedNormalizeAndValidateSymbol.mockImplementation((s) => {
      if (s === '') return null;
      return s.toUpperCase();
    });

    const locals = createMockLocals();
    const request = createMockRequest({
      weights: [
        { symbol: '', weight: 0.5 },
        { symbol: 'AAPL', weight: 0.5 },
      ],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const url = createMockUrl('https:');

    // Act
    const response = await POST({ locals, request, url } as any);

    // Assert
    expect(response.status).toBe(200);
  });
});
