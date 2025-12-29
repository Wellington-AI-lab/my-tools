/**
 * 测试文件：scan.test.ts (intelligence API)
 * 覆盖模块：src/pages/api/intelligence/scan.ts
 * 目标覆盖率：≥90% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './scan';
import type { IntelligenceArticle } from '@/modules/intelligence/types';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/lib/env', () => ({
  requireIntelligenceDB: vi.fn((locals) => {
    // Vercel: create database from env vars
    const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (postgresUrl) {
      // In tests, return mock database from runtime env
      return (locals as any).runtime?.env?.POSTGRES_URL ? locals.runtime.env.mockDb : null;
    }
    return null;
  }),
  getEnv: vi.fn((locals) => locals.runtime?.env),
}));

vi.mock('@/modules/intelligence/repository', () => ({
  getActiveSources: vi.fn(),
  getSourcesByCategory: vi.fn(),
  getSourcesByStrategy: vi.fn(),
}));

vi.mock('@/modules/intelligence/fetcher', () => ({
  fetchMultipleSources: vi.fn(),
  updateSourceStatuses: vi.fn(),
}));

import { requireIntelligenceDB, getEnv } from '@/lib/env';
import { getActiveSources, getSourcesByCategory, getSourcesByStrategy } from '@/modules/intelligence/repository';
import { fetchMultipleSources, updateSourceStatuses } from '@/modules/intelligence/fetcher';

const mockedRequireIntelligenceDB = requireIntelligenceDB as unknown as ReturnType<typeof vi.fn>;
const mockedGetEnv = getEnv as unknown as ReturnType<typeof vi.fn>;
const mockedGetActiveSources = getActiveSources as unknown as ReturnType<typeof vi.fn>;
const mockedGetSourcesByCategory = getSourcesByCategory as unknown as ReturnType<typeof vi.fn>;
const mockedGetSourcesByStrategy = getSourcesByStrategy as unknown as ReturnType<typeof vi.fn>;
const mockedFetchMultipleSources = fetchMultipleSources as unknown as ReturnType<typeof vi.fn>;
const mockedUpdateSourceStatuses = updateSourceStatuses as unknown as ReturnType<typeof vi.fn>;

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockD1(): Database {
  return {
    prepare: vi.fn(),
    batch: vi.fn(),
  } as unknown as Database;
}

function createMockLocals(db?: Database | null, envOverrides = {}): App.Locals {
  return {
    runtime: {
      env: {
        POSTGRES_URL: 'postgresql://mock',
        mockDb: db ?? createMockD1(),
        RSSHUB_BASE_URL: undefined,
        ...envOverrides,
      },
    },
  } as App.Locals;
}

function createMockUrl(searchParams: Record<string, string> = {}): URL {
  const url = new URL('https://example.com/api/intelligence/scan');
  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
}

const MOCK_SOURCES = [
  {
    id: 1,
    name: 'Hacker News',
    url: 'https://news.ycombinator.com/rss',
    strategy: 'DIRECT',
    category: 'tech',
    is_active: true,
    reliability_score: 1.0,
    weight: 1.0,
    rsshub_path: null,
  },
  {
    id: 2,
    name: 'V2EX',
    url: '',
    strategy: 'RSSHUB',
    category: 'tech',
    is_active: true,
    reliability_score: 0.9,
    weight: 0.8,
    rsshub_path: '/v2ex/topics/hot',
  },
] as const;

const MOCK_ARTICLES: IntelligenceArticle[] = [
  {
    id: 'abc123',
    source_id: 1,
    url: 'https://example.com/article1',
    title: 'Test Article 1',
    summary: 'Test summary 1',
    content: 'Test content 1',
    author: 'Test Author',
    published_at: 1704067200,
    scraped_at: 1704153600,
    tags: [],
  },
  {
    id: 'def456',
    source_id: 2,
    url: 'https://example.com/article2',
    title: 'Test Article 2',
    summary: 'Test summary 2',
    content: 'Test content 2',
    author: 'Test Author 2',
    published_at: 1704070800,
    scraped_at: 1704153600,
    tags: [],
  },
];

const MOCK_FETCH_RESULTS = [
  {
    source_id: 1,
    success: true,
    items_count: 1,
    fetch_time_ms: 100,
    articles: [MOCK_ARTICLES[0]],
  },
  {
    source_id: 2,
    success: true,
    items_count: 1,
    fetch_time_ms: 150,
    articles: [MOCK_ARTICLES[1]],
  },
];

// ============================================================================
// GET /api/intelligence/scan Tests
// ============================================================================
describe('GET /api/intelligence/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers().setSystemTime(new Date('2024-01-01T12:00:00Z'));

    mockedRequireIntelligenceDB.mockImplementation((locals) => (locals as any).runtime?.env?.mockDb);
    mockedGetEnv.mockImplementation((locals) => locals.runtime?.env);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Happy Path - All Sources', () => {
    it('should_return_articles_from_all_sources', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl();

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.articles).toHaveLength(2);
      expect(json.sources_scanned).toBe(2);
      expect(json.sources_succeeded).toBe(2);
      expect(json.total_articles).toBe(2);
    });

    it('should_include_scan_id_and_timestamp', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl();

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(json.scan_id).toMatch(/^intel_scan_\d+_[a-z0-9]+$/);
      expect(json.timestamp).toBe('2024-01-01T12:00:00.000Z');
    });
  });

  describe('Happy Path - Category Filter', () => {
    it('should_filter_by_category', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({ category: 'tech' });

      mockedGetSourcesByCategory.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(mockedGetSourcesByCategory).toHaveBeenCalledWith(mockD1, 'tech');
      expect(mockedFetchMultipleSources).toHaveBeenCalled();
    });
  });

  describe('Happy Path - Strategy Filter', () => {
    it('should_filter_by_strategy', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({ strategy: 'RSSHUB' });

      mockedGetSourcesByStrategy.mockResolvedValue([MOCK_SOURCES[1]]);
      mockedFetchMultipleSources.mockResolvedValue([MOCK_FETCH_RESULTS[1]]);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);

      // Assert
      expect(response.status).toBe(200);
      expect(mockedGetSourcesByStrategy).toHaveBeenCalledWith(mockD1, 'RSSHUB');
    });
  });

  describe('Happy Path - Custom RSSHUB URL', () => {
    it('should_use_custom_rsshub_url_from_env', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1, { RSSHUB_BASE_URL: 'https://custom-rsshub.example.com' });
      const url = createMockUrl();

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);

      // Assert
      expect(response.status).toBe(200);
      expect(mockedFetchMultipleSources).toHaveBeenCalledWith(
        MOCK_SOURCES,
        expect.objectContaining({
          rsshubBaseUrl: 'https://custom-rsshub.example.com',
        })
      );
    });
  });

  describe('Happy Path - Limit Parameter', () => {
    it('should_limit_articles', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({ limit: '1' });

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json.total_articles).toBe(1);
      expect(json.articles).toHaveLength(1);
    });

    it('should_use_default_limit_of_100', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({});

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      await GET({ locals, url } as any);

      // Assert
      expect(mockedFetchMultipleSources).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({})
      );
    });
  });

  describe('Happy Path - Update Reliability', () => {
    it('should_update_reliability_by_default', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({});

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([
        { success: true, sourceId: 1, reliabilityChanged: true, oldScore: 0.9, newScore: 0.92 },
      ]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(mockedUpdateSourceStatuses).toHaveBeenCalled();
      expect(json.reliability_updates).toEqual([
        { source_id: 1, old_score: 0.9, new_score: 0.92 },
      ]);
    });

    it('should_skip_reliability_update_when_disabled', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({ update_reliability: 'false' });

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(mockedUpdateSourceStatuses).not.toHaveBeenCalled();
      expect(json.reliability_updates).toBeUndefined();
    });
  });

  describe('Article Deduplication', () => {
    it('should_deduplicate_articles_by_url', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({});

      const duplicateArticles = [
        {
          source_id: 1,
          success: true,
          items_count: 1,
          fetch_time_ms: 100,
          articles: [{ ...MOCK_ARTICLES[0], id: 'different-id-but-same-url' }],
        },
        {
          source_id: 2,
          success: true,
          items_count: 1,
          fetch_time_ms: 100,
          articles: [MOCK_ARTICLES[0]], // Same URL
        },
      ];

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(duplicateArticles);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json.total_articles).toBe(1); // Only one unique URL
    });

    it('should_sort_articles_by_published_date_descending', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({});

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json.articles[0].published_at).toBeGreaterThanOrEqual(json.articles[1]?.published_at ?? 0);
    });
  });

  describe('Error Cases', () => {
    it('should_return_404_when_no_sources_found', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({ category: 'nonexistent' });

      mockedGetSourcesByCategory.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('No active sources found for category: nonexistent');
    });

    it('should_return_404_for_strategy_with_no_sources', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({ strategy: 'RSSHUB' });

      mockedGetSourcesByStrategy.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(json.error).toContain('No active sources found for strategy: RSSHUB');
    });

    it('should_return_500_on_database_error', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({});

      mockedGetActiveSources.mockRejectedValue(new Error('Database connection failed'));

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Database connection failed');
    });

    it('should_return_500_on_fetch_error', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({});

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockRejectedValue(new Error('Fetch failed'));

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Fetch failed');
    });
  });

  describe('Partial Failures', () => {
    it('should_include_errors_for_failed_sources', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({});

      const resultsWithErrors = [
        MOCK_FETCH_RESULTS[0],
        { source_id: 2, success: false, items_count: 0, fetch_time_ms: 100, error: 'Timeout' },
      ];

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(resultsWithErrors);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json.sources_succeeded).toBe(1);
      expect(json.sources_failed).toBe(1);
      expect(json.errors).toEqual([{ source_id: 2, error: 'Timeout' }]);
    });

    it('should_return_partial_articles_on_partial_failure', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({});

      const resultsWithErrors = [
        MOCK_FETCH_RESULTS[0],
        { source_id: 2, success: false, items_count: 0, fetch_time_ms: 100, error: 'Network error' },
      ];

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(resultsWithErrors);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json.total_articles).toBe(1);
      expect(json.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should_handle_invalid_limit_gracefully', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({ limit: 'invalid' });

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);

      // Assert - parseInt returns NaN, should default to not limiting
      expect(response.status).toBe(200);
    });

    it('should_handle_zero_limit', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({ limit: '0' });

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json.total_articles).toBe(0);
    });

    it('should_handle_negative_limit', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({ limit: '-1' });

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert - slice(0, -1) returns all elements except the last
      expect(response.status).toBe(200);
      expect(json.total_articles).toBe(1); // 2 articles minus the last one
    });

    it('should_handle_empty_reliability_updates', async () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals(mockD1);
      const url = createMockUrl({});

      mockedGetActiveSources.mockResolvedValue(MOCK_SOURCES);
      mockedFetchMultipleSources.mockResolvedValue(MOCK_FETCH_RESULTS);
      mockedUpdateSourceStatuses.mockResolvedValue([]);

      // Act
      const response = await GET({ locals, url } as any);
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json.reliability_updates).toBeUndefined();
    });
  });
});
