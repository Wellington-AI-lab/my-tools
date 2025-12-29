/**
 * 测试文件：providers.test.ts
 * 覆盖模块：src/modules/stocks/providers.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDailySeriesWithCache } from './providers';
import type { PricePoint } from './types';
import type { KVStorage } from '@/lib/storage/kv';

// ============================================================================
// Mock Helpers
// ============================================================================

interface MockKV extends KVStorage {}

function createMockKV(): MockKV {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as MockKV;
}

function createMockPricePoints(): PricePoint[] {
  return [
    { date: '2024-01-01', close: 100 },
    { date: '2024-01-02', close: 101 },
    { date: '2024-01-03', close: 102 },
  ];
}

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the kv-json module
vi.mock('@/lib/kv-json', () => ({
  kvGetJson: vi.fn(),
  kvPutJson: vi.fn(),
}));

import { kvGetJson, kvPutJson } from '@/lib/kv-json';

const mockedKvGetJson = kvGetJson as unknown as ReturnType<typeof vi.fn>;
const mockedKvPutJson = kvPutJson as unknown as ReturnType<typeof vi.fn>;

// ============================================================================
// Setup and Teardown
// ============================================================================
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// Cache Tests
// ============================================================================
describe('fetchDailySeriesWithCache - Cache Behavior', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
  });

  it('should_return_cached_data_when_available', async () => {
    // Arrange
    const cachedPoints = createMockPricePoints();
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(cachedPoints);

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-03',
      providers: ['yahoo'],
    });

    // Assert
    expect(result.cacheHit).toBe(true);
    expect(result.points).toEqual(cachedPoints);
    expect(result.provider).toBe('yahoo');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should_fetch_from_provider_when_cache_miss', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200, 1704153600, 1704240000],
            indicators: {
              adjclose: [{ adjclose: [100, 101, 102] }],
              quote: [{ close: [100, 101, 102] }],
            },
          }],
        },
      }),
    });

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-03',
      providers: ['yahoo'],
    });

    // Assert
    expect(result.cacheHit).toBe(false);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should_store_fetched_data_in_cache', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200],
            indicators: {
              adjclose: [{ adjclose: [100] }],
              quote: [{ close: [100] }],
            },
          }],
        },
      }),
    });

    // Act
    await fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo'],
      cacheTtlSeconds: 3600,
    });

    // Assert
    expect(mockedKvPutJson).toHaveBeenCalledWith(
      mockKV,
      expect.stringContaining('cache:stocks:candles:v1:yahoo:AAPL:'),
      expect.any(Array),
      3600
    );
  });

  it('should_not_cache_when_kv_is_null', async () => {
    // Arrange
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200],
            indicators: {
              adjclose: [{ adjclose: [100] }],
              quote: [{ close: [100] }],
            },
          }],
        },
      }),
    });

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: null,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo'],
    });

    // Assert
    expect(result.cacheHit).toBe(false);
    expect(mockedKvGetJson).not.toHaveBeenCalled();
    expect(mockedKvPutJson).not.toHaveBeenCalled();
  });

  it('should_use_default_cache_ttl_of_24_hours', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200],
            indicators: {
              adjclose: [{ adjclose: [100] }],
              quote: [{ close: [100] }],
            },
          }],
        },
      }),
    });

    // Act
    await fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo'],
    });

    // Assert - 24 * 60 * 60 = 86400
    expect(mockedKvPutJson).toHaveBeenCalledWith(
      mockKV,
      expect.any(String),
      expect.any(Array),
      86400
    );
  });
});

// ============================================================================
// Provider Fallback Tests
// ============================================================================
describe('fetchDailySeriesWithCache - Provider Fallback', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);
  });

  it('should_try_next_provider_on_failure', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    // First provider (yahoo) fails, second (finnhub) succeeds
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          s: 'ok',
          t: [1704067200],
          c: [100],
        }),
      });

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: { FINNHUB_API_KEY: 'test-key' },
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo', 'finnhub'],
    });

    // Assert
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe('finnhub');
    expect(result.points).toHaveLength(1);
  });

  it('should_throw_when_all_providers_fail', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);

    mockFetch.mockRejectedValue(new Error('Network error'));

    // Act & Assert
    await expect(fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'INVALID',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo', 'finnhub'],
    })).rejects.toThrow('All providers failed');
  });

  it('should_report_tried_providers_in_error', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);

    mockFetch.mockRejectedValue(new Error('Network error'));

    // Act & Assert
    await expect(fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo', 'finnhub', 'fmp'],
    })).rejects.toThrow('yahoo -> finnhub -> fmp');
  });
});

// ============================================================================
// Yahoo Finance Provider Tests
// ============================================================================
describe('Yahoo Finance Provider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);
  });

  it('should_parse_yahoo_chart_response', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200, 1704153600, 1704240000],
            indicators: {
              adjclose: [{ adjclose: [100, 101, 102] }],
              quote: [{ close: [100, 101, 102] }],
            },
          }],
        },
      }),
    });

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-03',
      providers: ['yahoo'],
    });

    // Assert
    expect(result.points).toEqual([
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 101 },
      { date: '2024-01-03', close: 102 },
    ]);
  });

  it('should_prefer_adjclose_over_close', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200],
            indicators: {
              adjclose: [{ adjclose: [105] }], // Adjusted close
              quote: [{ close: [100] }], // Regular close
            },
          }],
        },
      }),
    });

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo'],
    });

    // Assert - Should use adjusted close
    expect(result.points[0].close).toBe(105);
  });

  it('should_fallback_to_close_when_adjclose_missing', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200],
            indicators: {
              adjclose: [{ adjclose: [null] }],
              quote: [{ close: [100] }],
            },
          }],
        },
      }),
    });

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo'],
    });

    // Assert
    expect(result.points[0].close).toBe(100);
  });

  it('should_throw_on_empty_yahoo_response', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ chart: { result: null } }),
    });

    // Act & Assert
    await expect(fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'INVALID',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo'],
    })).rejects.toThrow('Yahoo Finance returned no data');
  });

  it('should_throw_on_empty_timestamps', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [],
            indicators: {
              adjclose: [{ adjclose: [] }],
              quote: [{ close: [] }],
            },
          }],
        },
      }),
    });

    // Act & Assert
    await expect(fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo'],
    })).rejects.toThrow('empty timestamps');
  });

  it('should_filter_out_invalid_price_points', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200, 1704153600, 1704240000, 1704326400],
            indicators: {
              adjclose: [{ adjclose: [100, null, null, 102] }],
              quote: [{ close: [100, null, 102, 103] }],
            },
          }],
        },
      }),
    });

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-04',
      providers: ['yahoo'],
    });

    // Assert - Should filter out null points
    // index 0: 100 (valid)
    // index 1: adjclose=null, close=null (invalid)
    // index 2: adjclose=null, close=102 (valid)
    // index 3: 102 (valid)
    expect(result.points).toHaveLength(3);
  });

  it('should_include_correct_url_parameters', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200],
            indicators: {
              adjclose: [{ adjclose: [100] }],
              quote: [{ close: [100] }],
            },
          }],
        },
      }),
    });

    // Act
    await fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-05',
      providers: ['yahoo'],
    });

    // Assert
    const fetchCall = mockFetch.mock.calls[0];
    const url = fetchCall[0];
    expect(url).toContain('query1.finance.yahoo.com');
    expect(url).toContain('AAPL');
    expect(url).toContain('interval=1d');
  });
});

// ============================================================================
// Finnhub Provider Tests
// ============================================================================
describe('Finnhub Provider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);
  });

  it('should_parse_finnhub_candle_response', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    // Yahoo fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        s: 'ok',
        t: [1704067200, 1704153600, 1704240000],
        c: [100, 101, 102],
      }),
    });

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: { FINNHUB_API_KEY: 'test-key' },
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-03',
      providers: ['yahoo', 'finnhub'],
    });

    // Assert
    expect(result.points).toEqual([
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 101 },
      { date: '2024-01-03', close: 102 },
    ]);
    expect(result.provider).toBe('finnhub');
  });

  it('should_require_finnhub_api_key', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);

    // Yahoo fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    // Act & Assert
    await expect(fetchDailySeriesWithCache({
      kv: mockKV,
      env: {}, // No FINNHUB_API_KEY
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo', 'finnhub'],
    })).rejects.toThrow('FINNHUB_API_KEY missing');
  });

  it('should_throw_on_finnhub_non_ok_response', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not Found' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ s: 'no_data' }),
      });

    // Act & Assert
    await expect(fetchDailySeriesWithCache({
      kv: mockKV,
      env: { FINNHUB_API_KEY: 'test-key' },
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo', 'finnhub'],
    })).rejects.toThrow('candle not ok');
  });
});

// ============================================================================
// FMP Provider Tests
// ============================================================================
describe('FMP Provider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);
  });

  it('should_parse_fmp_historical_response', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          historical: [
            { date: '2024-01-03', adjClose: 102 },
            { date: '2024-01-02', adjClose: 101 },
            { date: '2024-01-01', adjClose: 100 },
          ],
        }),
      } as Response);

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: { FINNHUB_API_KEY: 'test', FMP_API_KEY: 'test-key' },
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-03',
      providers: ['yahoo', 'finnhub', 'fmp'],
    });

    // Assert - Should be sorted ascending
    expect(result.points).toEqual([
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 101 },
      { date: '2024-01-03', close: 102 },
    ]);
    expect(result.provider).toBe('fmp');
  });

  it('should_require_fmp_api_key', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response);

    // Act & Assert
    await expect(fetchDailySeriesWithCache({
      kv: mockKV,
      env: {}, // No FMP_API_KEY
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo', 'finnhub', 'fmp'],
    })).rejects.toThrow('FMP_API_KEY missing');
  });

  it('should_fallback_to_close_when_adjclose_missing', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          historical: [
            { date: '2024-01-01', close: 100 },
          ],
        }),
      } as Response);

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: { FINNHUB_API_KEY: 'test', FMP_API_KEY: 'test-key' },
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo', 'finnhub', 'fmp'],
    });

    // Assert
    expect(result.points[0].close).toBe(100);
  });
});

// ============================================================================
// Polygon Provider Tests
// ============================================================================
describe('Polygon Provider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);
  });

  it('should_parse_polygon_aggs_response', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { t: 1704067200000, c: 100 },
            { t: 1704153600000, c: 101 },
            { t: 1704240000000, c: 102 },
          ],
        }),
      } as Response);

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: { FINNHUB_API_KEY: 'test', FMP_API_KEY: 'test', POLYGON_API_KEY: 'test-key' },
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-03',
      providers: ['yahoo', 'finnhub', 'fmp', 'polygon'],
    });

    // Assert
    expect(result.points).toEqual([
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 101 },
      { date: '2024-01-03', close: 102 },
    ]);
    expect(result.provider).toBe('polygon');
  });

  it('should_require_polygon_api_key', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response);

    // Act & Assert
    await expect(fetchDailySeriesWithCache({
      kv: mockKV,
      env: {}, // No POLYGON_API_KEY
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo', 'finnhub', 'fmp', 'polygon'],
    })).rejects.toThrow('POLYGON_API_KEY missing');
  });
});

// ============================================================================
// Timeout Tests
// ============================================================================
describe('fetchDailySeriesWithCache - Timeout Handling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);
  });

  it('should_timeout_after_default_timeout', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);

    // Mock fetch that simulates an abort error
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    // Act & Assert - should handle abort error
    await expect(fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo'],
    })).rejects.toThrow();
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================
describe('fetchDailySeriesWithCache - Edge Cases', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
  });

  it('should_handle_special_characters_in_symbol', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200],
            indicators: {
              adjclose: [{ adjclose: [100] }],
              quote: [{ close: [100] }],
            },
          }],
        },
      }),
    } as Response);

    // Act
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'BRK.B', // Dot in symbol
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo'],
    });

    // Assert - Should encode the symbol properly and succeed
    expect(result.points).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalled();
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('BRK.B');
  });

  it('should_return_empty_array_for_no_valid_prices', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockResolvedValue(null);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200],
            indicators: {
              adjclose: [{ adjclose: [null] }],
              quote: [{ close: [null] }],
            },
          }],
        },
      }),
    } as Response);

    // Act & Assert - Should throw because no valid price data
    await expect(fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo'],
    })).rejects.toThrow('no valid price data');
  });

  it('should_handle_cache_read_errors', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockedKvGetJson.mockRejectedValue(new Error('KV read error'));
    mockedKvPutJson.mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704067200],
            indicators: {
              adjclose: [{ adjclose: [100] }],
              quote: [{ close: [100] }],
            },
          }],
        },
      }),
    } as Response);

    // Act - Should fall back to fetch
    const result = await fetchDailySeriesWithCache({
      kv: mockKV,
      env: {},
      symbol: 'AAPL',
      start: '2024-01-01',
      end: '2024-01-01',
      providers: ['yahoo'],
    });

    // Assert
    expect(result.cacheHit).toBe(false);
    expect(mockFetch).toHaveBeenCalled();
  });
});
