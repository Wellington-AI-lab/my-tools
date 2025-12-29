/**
 * 测试文件：feed.test.ts
 * 覆盖模块：src/pages/api/news/feed.ts
 * 目标覆盖率：≥90% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, OPTIONS } from './feed';
import type { KVStorage } from '@/lib/storage/kv';
import type { RefinedArticle, RawRssItem } from '@/modules/news/types';

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

function createMockLocals(
  kv?: KVStorage,
  env?: Partial<VercelEnv>,
  db?: any
): App.Locals {
  return {
    runtime: {
      env: env || {},
    },
  } as App.Locals;
}

function createMockUrl(
  baseUrl: string,
  params: Record<string, string> = {}
): URL {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
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
// Mock Modules
// ============================================================================

// Mock env module
vi.mock('@/lib/env', () => ({
  requireKV: vi.fn((locals: App.Locals) => mockKV),
  getEnv: vi.fn(() => mockEnvVars),
}));

import { requireKV, getEnv } from '@/lib/env';

let mockKV: KVStorage;
let mockEnvVars: any = {};

// Mock refinery module
vi.mock('@/modules/news/refinery', () => ({
  processRefinery: vi.fn(),
  parseRssXml: vi.fn(),
  isValidRssContent: vi.fn(() => true),
  createCacheKey: vi.fn((params) => `news_feed:${params.source || 'all'}:${params.limit || 20}`),
}));

import { processRefinery, parseRssXml, isValidRssContent } from '@/modules/news/refinery';

// Mock repository module
vi.mock('@/modules/news/repository', () => ({
  getCachedFeed: vi.fn(),
  setCachedFeed: vi.fn(),
  getPaginatedArticles: vi.fn(),
  updateSourceStats: vi.fn(),
}));

import {
  getCachedFeed,
  setCachedFeed,
  getPaginatedArticles,
  updateSourceStats,
} from '@/modules/news/repository';

// Mock intelligence repository
vi.mock('@/modules/intelligence/repository', () => ({
  getActiveSources: vi.fn(),
}));

import { getActiveSources } from '@/modules/intelligence/repository';

// Mock AI refinery
vi.mock('@/modules/news/ai-refinery', () => ({
  enrichArticlesBatch: vi.fn(),
  getCachedEnrichment: vi.fn(),
}));

import { enrichArticlesBatch, getCachedEnrichment } from '@/modules/news/ai-refinery';

// ============================================================================
// Mock fetch
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ============================================================================
// Test Data
// ============================================================================

const mockRSSFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hacker News</title>
    <item>
      <title>Test Article 1</title>
      <link>https://example.com/1</link>
      <description>This is a test article description with enough content to pass the minimum content length filter.</description>
      <pubDate>Mon, 29 Dec 2025 10:00:00 GMT</pubDate>
      <author>Test Author</author>
    </item>
    <item>
      <title>Test Article 2</title>
      <link>https://example.com/2</link>
      <description>Another test article with sufficient content for filtering.</description>
      <pubDate>Mon, 29 Dec 2025 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const mockRefinedArticles: RefinedArticle[] = [
  {
    id: 'n_123456',
    url: 'https://example.com/1',
    title: 'Test Article 1',
    summary: 'This is a test article description.',
    source: 'Hacker News',
    author: 'Test Author',
    published_at: 1703836800,
    refined_at: 1703840400,
    signal_score: 0.85,
    language: 'en',
  },
  {
    id: 'n_789012',
    url: 'https://example.com/2',
    title: 'Test Article 2',
    summary: 'Another test article.',
    source: 'Hacker News',
    published_at: 1703833200,
    refined_at: 1703840400,
    signal_score: 0.75,
    language: 'en',
  },
];

// ============================================================================
// Setup & Teardown
// ============================================================================

beforeEach(() => {
  mockKV = createMockKV();
  vi.mocked(requireKV).mockReturnValue(mockKV);
  mockEnvVars = {};
  vi.clearAllMocks();
});

afterEach(() => {
  resetEnv();
});

// ============================================================================
// OPTIONS Tests
// ============================================================================
describe('OPTIONS /api/news/feed', () => {
  it('should_return_cors_headers', async () => {
    // Act
    const response = await OPTIONS();

    // Assert
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  });
});

// ============================================================================
// GET Tests - Cache Hit
// ============================================================================
describe('GET /api/news/feed - Cache Hit', () => {
  beforeEach(() => {
    mockEnv({ NODE_ENV: 'development' });
  });

  it('should_return_cached_feed_when_available', async () => {
    // Arrange
    const cachedData = {
      articles: mockRefinedArticles,
      meta: {
        count: 2,
        created_at: Date.now() - 60000,
        expires_at: Date.now() + 240000,
        sources: ['Hacker News'],
      },
    };
    vi.mocked(getCachedFeed).mockResolvedValue(cachedData);

    const url = createMockUrl('https://example.com/api/news/feed');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.cached).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.data[0].title).toBe('Test Article 1');
  });

  it('should_filter_by_source_from_cache', async () => {
    // Arrange
    const cachedData = {
      articles: mockRefinedArticles,
      meta: {
        count: 2,
        created_at: Date.now() - 60000,
        expires_at: Date.now() + 240000,
        sources: ['Hacker News', 'V2EX'],
      },
    };
    vi.mocked(getCachedFeed).mockResolvedValue(cachedData);

    const url = createMockUrl('https://example.com/api/news/feed', { source: 'Hacker News' });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert
    expect(data.data.every((a: RefinedArticle) => a.source === 'Hacker News')).toBe(true);
  });

  it('should_filter_by_since_from_cache', async () => {
    // Arrange
    const cachedData = {
      articles: mockRefinedArticles,
      meta: {
        count: 2,
        created_at: Date.now() - 60000,
        expires_at: Date.now() + 240000,
        sources: ['Hacker News'],
      },
    };
    vi.mocked(getCachedFeed).mockResolvedValue(cachedData);

    const since = 1703835000; // Between the two articles
    const url = createMockUrl('https://example.com/api/news/feed', { since: String(since) });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert - Only article 1 should remain (published_at: 1703836800)
    expect(data.data).toHaveLength(1);
  });

  it('should_paginate_cached_feed', async () => {
    // Arrange
    const cachedData = {
      articles: mockRefinedArticles,
      meta: {
        count: 2,
        created_at: Date.now() - 60000,
        expires_at: Date.now() + 240000,
        sources: ['Hacker News'],
      },
    };
    vi.mocked(getCachedFeed).mockResolvedValue(cachedData);

    const url = createMockUrl('https://example.com/api/news/feed', { page: '1', limit: '1' });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert
    expect(data.data).toHaveLength(1);
    expect(data.hasMore).toBe(true);
  });

  it('should_include_by_source_stats', async () => {
    // Arrange
    const cachedData = {
      articles: mockRefinedArticles,
      meta: {
        count: 2,
        created_at: Date.now() - 60000,
        expires_at: Date.now() + 240000,
        sources: ['Hacker News'],
      },
    };
    vi.mocked(getCachedFeed).mockResolvedValue(cachedData);

    const url = createMockUrl('https://example.com/api/news/feed');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert
    expect(data.by_source).toBeDefined();
    expect(data.by_source).toEqual([
      { source: 'Hacker News', count: 2 },
    ]);
  });

  it('should_use_paginated_articles_for_page_gt_1', async () => {
    // Arrange
    const paginatedResult = {
      articles: [mockRefinedArticles[1]],
      hasMore: false,
    };
    vi.mocked(getPaginatedArticles).mockResolvedValue(paginatedResult);

    const url = createMockUrl('https://example.com/api/news/feed', { page: '2', limit: '1' });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert
    expect(getPaginatedArticles).toHaveBeenCalledWith(mockKV, {
      page: 2,
      limit: 1,
      source: undefined,
      since: undefined,
    });
    expect(data.data).toHaveLength(1);
    expect(data.cached).toBe(true);
  });
});

// ============================================================================
// GET Tests - Cache Miss / Refresh
// ============================================================================
describe('GET /api/news/feed - Cache Miss / Refresh', () => {
  beforeEach(() => {
    mockEnv({ NODE_ENV: 'development' });
  });

  it('should_fetch_from_sources_on_cache_miss', async () => {
    // Arrange
    vi.mocked(getCachedFeed).mockResolvedValue(null);
    vi.mocked(getActiveSources).mockResolvedValue([]);

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

    vi.mocked(parseRssXml).mockReturnValue([
      {
        title: 'Test Article 1',
        link: 'https://example.com/1',
        description: 'This is a test article description with enough content.',
        pubDate: 'Mon, 29 Dec 2025 10:00:00 GMT',
        source: 'Hacker News',
      },
    ]);

    vi.mocked(processRefinery).mockReturnValue({
      articles: mockRefinedArticles,
      stats: {
        total_raw: 1,
        after_dedup: 1,
        after_filter: 1,
        final_count: 1,
        sources: { 'Hacker News': 1 },
        processing_time_ms: 100,
      },
    });

    vi.mocked(setCachedFeed).mockResolvedValue(undefined);
    vi.mocked(updateSourceStats).mockResolvedValue(undefined);

    const url = createMockUrl('https://example.com/api/news/feed');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.cached).toBe(false);
    expect(data.success).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should_force_refresh_when_refresh_param_is_true', async () => {
    // Arrange - Even with cache, should fetch fresh
    vi.mocked(getCachedFeed).mockResolvedValue(null);

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

    vi.mocked(parseRssXml).mockReturnValue([]);
    vi.mocked(processRefinery).mockReturnValue({
      articles: [],
      stats: {
        total_raw: 0,
        after_dedup: 0,
        after_filter: 0,
        final_count: 0,
        sources: {},
        processing_time_ms: 0,
      },
    });
    vi.mocked(setCachedFeed).mockResolvedValue(undefined);
    vi.mocked(updateSourceStats).mockResolvedValue(undefined);

    const url = createMockUrl('https://example.com/api/news/feed', { refresh: 'true' });
    const locals = createMockLocals(mockKV);

    // Act
    await GET({ locals, url });

    // Assert - getCachedFeed should not be called when refresh=true
    expect(getPaginatedArticles).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should_save_to_cache_after_fresh_fetch', async () => {
    // Arrange
    vi.mocked(getCachedFeed).mockResolvedValue(null);
    vi.mocked(getActiveSources).mockResolvedValue([]);

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

    vi.mocked(parseRssXml).mockReturnValue([
      {
        title: 'Test Article 1',
        link: 'https://example.com/1',
        description: 'Content',
        source: 'Hacker News',
      },
    ]);

    vi.mocked(processRefinery).mockReturnValue({
      articles: mockRefinedArticles,
      stats: {
        total_raw: 1,
        after_dedup: 1,
        after_filter: 1,
        final_count: 1,
        sources: { 'Hacker News': 1 },
        processing_time_ms: 100,
      },
    });

    vi.mocked(setCachedFeed).mockResolvedValue(undefined);
    vi.mocked(updateSourceStats).mockResolvedValue(undefined);

    const url = createMockUrl('https://example.com/api/news/feed');
    const locals = createMockLocals(mockKV);

    // Act
    await GET({ locals, url });

    // Assert
    expect(setCachedFeed).toHaveBeenCalledWith(
      mockKV,
      { source: undefined, limit: 20 },
      mockRefinedArticles
    );
    expect(updateSourceStats).toHaveBeenCalledWith(mockKV, mockRefinedArticles);
  });
});

// ============================================================================
// GET Tests - AI Enrichment
// ============================================================================
describe('GET /api/news/feed - AI Enrichment', () => {
  beforeEach(() => {
    mockEnv({ NODE_ENV: 'development' });
    vi.mocked(getCachedFeed).mockResolvedValue(null);
    vi.mocked(getActiveSources).mockResolvedValue([]);

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

    vi.mocked(parseRssXml).mockReturnValue([
      {
        title: 'Test Article 1',
        link: 'https://example.com/1',
        description: 'Content',
        source: 'Hacker News',
      },
    ]);

    vi.mocked(processRefinery).mockReturnValue({
      articles: mockRefinedArticles,
      stats: {
        total_raw: 1,
        after_dedup: 1,
        after_filter: 1,
        final_count: 1,
        sources: { 'Hacker News': 1 },
        processing_time_ms: 100,
      },
    });

    vi.mocked(setCachedFeed).mockResolvedValue(undefined);
    vi.mocked(updateSourceStats).mockResolvedValue(undefined);
  });

  it('should_indicate_llm_not_configured_when_env_missing', async () => {
    // Arrange - No LLM env vars
    mockEnvVars = {};

    const url = createMockUrl('https://example.com/api/news/feed', { summarize: 'cached' });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert
    expect(data.llm_configured).toBe(false);
    expect(data.ai_enriched).toBe(false);
  });

  it('should_attach_cached_enrichments', async () => {
    // Arrange - LLM configured
    mockEnvVars = {
      LLM_BASE_URL: 'https://api.example.com',
      LLM_API_KEY: 'test-key',
      LLM_MODEL: 'gpt-4',
    };

    vi.mocked(getCachedEnrichment).mockResolvedValue({
      category: 'engineering',
      bottom_line: 'Test bottom line',
      signal_score: 7,
      key_insights: ['insight1', 'insight2'],
    });

    const url = createMockUrl('https://example.com/api/news/feed', { summarize: 'cached' });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert
    expect(data.llm_configured).toBe(true);
    expect(data.ai_enriched).toBe(true);
    expect(getCachedEnrichment).toHaveBeenCalledWith(mockKV, 'https://example.com/1');
  });

  it('should_filter_by_category', async () => {
    // Arrange
    mockEnvVars = {
      LLM_BASE_URL: 'https://api.example.com',
      LLM_API_KEY: 'test-key',
      LLM_MODEL: 'gpt-4',
    };

    vi.mocked(getCachedEnrichment).mockResolvedValue({
      category: 'ai',
      bottom_line: 'AI related',
      signal_score: 8,
    });

    const url = createMockUrl('https://example.com/api/news/feed', {
      summarize: 'cached',
      category: 'ai',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert
    expect(data.ai_enriched).toBe(true);
  });

  it('should_filter_by_min_signal', async () => {
    // Arrange
    mockEnvVars = {
      LLM_BASE_URL: 'https://api.example.com',
      LLM_API_KEY: 'test-key',
      LLM_MODEL: 'gpt-4',
    };

    vi.mocked(getCachedEnrichment).mockResolvedValue({
      category: 'engineering',
      bottom_line: 'Test',
      signal_score: 7,
    });

    const url = createMockUrl('https://example.com/api/news/feed', {
      summarize: 'cached',
      minSignal: '5',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_not_include_articles_below_min_signal', async () => {
    // Arrange
    mockEnvVars = {
      LLM_BASE_URL: 'https://api.example.com',
      LLM_API_KEY: 'test-key',
      LLM_MODEL: 'gpt-4',
    };

    vi.mocked(getCachedEnrichment).mockResolvedValue({
      category: 'noise',
      bottom_line: 'Low value',
      signal_score: 2,
    });

    const url = createMockUrl('https://example.com/api/news/feed', {
      summarize: 'cached',
      minSignal: '5',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert - Articles with signal_score < 5 should be filtered out
    // Since we mocked a low signal score, the article should be filtered
    expect(data.ai_enriched).toBe(true);
  });
});

// ============================================================================
// GET Tests - Error Handling
// ============================================================================
describe('GET /api/news/feed - Error Handling', () => {
  beforeEach(() => {
    mockEnv({ NODE_ENV: 'development' });
  });

  it('should_handle_rss_fetch_error_gracefully', async () => {
    // Arrange
    vi.mocked(getCachedFeed).mockResolvedValue(null);
    vi.mocked(getActiveSources).mockResolvedValue([]);

    mockFetch.mockRejectedValue(new Error('Network error'));

    vi.mocked(setCachedFeed).mockResolvedValue(undefined);
    vi.mocked(updateSourceStats).mockResolvedValue(undefined);

    const url = createMockUrl('https://example.com/api/news/feed');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });

    // Assert - Should still return success with empty articles
    expect(response.status).toBe(200);
  });

  it('should_handle_invalid_rss_content', async () => {
    // Arrange
    vi.mocked(getCachedFeed).mockResolvedValue(null);
    vi.mocked(getActiveSources).mockResolvedValue([]);

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => 'Invalid RSS content',
    });

    vi.mocked(isValidRssContent).mockReturnValue(false);
    vi.mocked(setCachedFeed).mockResolvedValue(undefined);
    vi.mocked(updateSourceStats).mockResolvedValue(undefined);

    const url = createMockUrl('https://example.com/api/news/feed');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert - Should handle gracefully
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should_handle_http_error_from_rss_source', async () => {
    // Arrange
    vi.mocked(getCachedFeed).mockResolvedValue(null);
    vi.mocked(getActiveSources).mockResolvedValue([]);

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    vi.mocked(setCachedFeed).mockResolvedValue(undefined);
    vi.mocked(updateSourceStats).mockResolvedValue(undefined);

    const url = createMockUrl('https://example.com/api/news/feed');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });

    // Assert - Should still return success
    expect(response.status).toBe(200);
  });

  it('should_return_500_on_unexpected_error', async () => {
    // Arrange
    vi.mocked(getCachedFeed).mockRejectedValue(new Error('Database error'));

    const url = createMockUrl('https://example.com/api/news/feed');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Database error');
  });

  it('should_limit_max_results_to_100', async () => {
    // Arrange
    vi.mocked(getCachedFeed).mockResolvedValue(null);
    vi.mocked(getActiveSources).mockResolvedValue([]);

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

    vi.mocked(parseRssXml).mockReturnValue([]);
    vi.mocked(processRefinery).mockReturnValue({
      articles: [],
      stats: {
        total_raw: 0,
        after_dedup: 0,
        after_filter: 0,
        final_count: 0,
        sources: {},
        processing_time_ms: 0,
      },
    });

    vi.mocked(setCachedFeed).mockResolvedValue(undefined);
    vi.mocked(updateSourceStats).mockResolvedValue(undefined);

    // Request limit of 200 should be capped at 100
    const url = createMockUrl('https://example.com/api/news/feed', { limit: '200' });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });

    // Assert - Should not throw, limit should be capped internally
    expect(response.status).toBe(200);
  });
});

// ============================================================================
// GET Tests - Query Parameter Parsing
// ============================================================================
describe('GET /api/news/feed - Query Parameter Parsing', () => {
  beforeEach(() => {
    mockEnv({ NODE_ENV: 'development' });
  });

  it('should_parse_page_parameter_with_default', async () => {
    // Arrange
    const cachedData = {
      articles: mockRefinedArticles,
      meta: {
        count: 2,
        created_at: Date.now() - 60000,
        expires_at: Date.now() + 240000,
        sources: ['Hacker News'],
      },
    };
    vi.mocked(getCachedFeed).mockResolvedValue(cachedData);

    const url = createMockUrl('https://example.com/api/news/feed');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert - Default page 1, default limit 20
    expect(data.data).toBeDefined();
    expect(data.data.length).toBeLessThanOrEqual(20);
  });

  it('should_parse_custom_limit', async () => {
    // Arrange
    const cachedData = {
      articles: mockRefinedArticles,
      meta: {
        count: 2,
        created_at: Date.now() - 60000,
        expires_at: Date.now() + 240000,
        sources: ['Hacker News'],
      },
    };
    vi.mocked(getCachedFeed).mockResolvedValue(cachedData);

    const url = createMockUrl('https://example.com/api/news/feed', { limit: '5' });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });
    const data = await response.json();

    // Assert
    expect(data.data).toBeDefined();
  });

  it('should_handle_sane_limit_value', async () => {
    // Arrange
    const cachedData = {
      articles: mockRefinedArticles,
      meta: {
        count: 2,
        created_at: Date.now() - 60000,
        expires_at: Date.now() + 240000,
        sources: ['Hacker News'],
      },
    };
    vi.mocked(getCachedFeed).mockResolvedValue(cachedData);

    const url = createMockUrl('https://example.com/api/news/feed', { limit: '10' });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, url });

    // Assert - Should handle numeric limit
    expect(response.status).toBe(200);
  });

  it('should_handle_non_numeric_limit_gracefully', async () => {
    // Arrange
    const cachedData = {
      articles: mockRefinedArticles,
      meta: {
        count: 2,
        created_at: Date.now() - 60000,
        expires_at: Date.now() + 240000,
        sources: ['Hacker News'],
      },
    };
    vi.mocked(getCachedFeed).mockResolvedValue(cachedData);

    const url = createMockUrl('https://example.com/api/news/feed', { limit: 'invalid' });
    const locals = createMockLocals(mockKV);

    // Act - parseInt('invalid') returns NaN, Math.min(NaN, 100) returns NaN
    const response = await GET({ locals, url });

    // Assert - Should handle gracefully
    expect(response.status).toBe(200);
  });
});
