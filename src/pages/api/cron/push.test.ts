/**
 * 测试文件：push.test.ts
 * 覆盖模块：src/pages/api/cron/push.ts
 * 目标覆盖率：≥90% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, OPTIONS } from './push';
import type { KVStorage } from '@/lib/storage/kv';
import type { RefinedArticle } from '@/modules/news/types';
import type { Database } from '@/lib/storage/db';

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

function createMockDB(): Database {
  const mockAll = vi.fn(() => Promise.resolve({ results: [] }));
  const mockFirst = vi.fn(() => Promise.resolve(null));
  const mockRun = vi.fn(() => Promise.resolve({ meta: {} }));
  const mockBind = vi.fn(() => ({
    all: mockAll,
    first: mockFirst,
    run: mockRun,
  }));
  const mockPrepare = vi.fn(() => ({
    bind: mockBind,
  }));
  return {
    prepare: mockPrepare,
  } as any;
}

function createMockLocals(kv?: KVStorage, db?: Database): App.Locals {
  return {
    runtime: {
      env: {},
    },
  } as App.Locals;
}

function createMockRequest(
  url: string,
  headers: Record<string, string> = {}
): Request {
  return {
    url,
    headers: {
      get: (name: string) => {
        const lowerName = name.toLowerCase();
        if (lowerName === 'authorization') return headers['authorization'] || null;
        if (lowerName === 'x-cron-secret') return headers['x-cron-secret'] || null;
        return null;
      },
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
// Mock Modules
// ============================================================================

// Mock env module
vi.mock('@/lib/env', () => ({
  requireKV: vi.fn((locals: App.Locals) => mockKV),
  getEnv: vi.fn(() => ({})),
  getIntelligenceDB: vi.fn((locals: App.Locals) => mockDB),
}));

import { requireKV, getEnv, getIntelligenceDB } from '@/lib/env';

let mockKV: KVStorage;
let mockDB: Database;

// Mock intelligence repository
vi.mock('@/modules/intelligence/repository', () => ({
  getActiveSources: vi.fn(),
}));

import { getActiveSources } from '@/modules/intelligence/repository';

// Mock refinery module
vi.mock('@/modules/news/refinery', () => ({
  processRefinery: vi.fn(),
  parseRssXml: vi.fn(() => []),
  isValidRssContent: vi.fn(() => true),
}));

import { processRefinery, parseRssXml, isValidRssContent } from '@/modules/news/refinery';

// Mock AI refinery
vi.mock('@/modules/news/ai-refinery', () => ({
  getCachedEnrichment: vi.fn(),
}));

import { getCachedEnrichment } from '@/modules/news/ai-refinery';

// Mock signal-push modules
vi.mock('@/modules/signal-push/webhook', () => ({
  sendPushAll: vi.fn(),
  sendPush: vi.fn(),
}));

vi.mock('@/modules/signal-push/repository', () => ({
  filterUnpushed: vi.fn(),
  markAsPushed: vi.fn(),
  recordFailure: vi.fn(),
  getStats: vi.fn(),
}));

import { sendPushAll } from '@/modules/signal-push/webhook';
import { filterUnpushed, markAsPushed, recordFailure, getStats } from '@/modules/signal-push/repository';

// ============================================================================
// Mock fetch
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ============================================================================
// Test Data
// ============================================================================

const mockRefinedArticles: RefinedArticle[] = [
  {
    id: 'n_123',
    url: 'https://example.com/article1',
    title: 'High Signal Article 1',
    summary: 'This is a high signal article.',
    source: 'Hacker News',
    published_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    refined_at: Math.floor(Date.now() / 1000),
    signal_score: 0.9,
    language: 'en',
  },
  {
    id: 'n_456',
    url: 'https://example.com/article2',
    title: 'High Signal Article 2',
    summary: 'Another high signal article.',
    source: 'TechCrunch',
    published_at: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
    refined_at: Math.floor(Date.now() / 1000),
    signal_score: 0.85,
    language: 'en',
  },
];

const mockRSSFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hacker News</title>
    <item>
      <title>High Signal Article 1</title>
      <link>https://example.com/article1</link>
      <description>This is a high signal article with substantial content that should pass the filter.</description>
      <pubDate>Mon, 29 Dec 2025 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

// ============================================================================
// Setup & Teardown
// ============================================================================

beforeEach(() => {
  mockKV = createMockKV();
  mockDB = createMockDB();
  vi.mocked(requireKV).mockReturnValue(mockKV);
  vi.mocked(getIntelligenceDB).mockReturnValue(mockDB);
  vi.clearAllMocks();
});

afterEach(() => {
  resetEnv();
});

// ============================================================================
// OPTIONS Tests
// ============================================================================
describe('OPTIONS /api/cron/push', () => {
  it('should_return_cors_headers', async () => {
    // Act
    const response = await OPTIONS();

    // Assert
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Cron-Secret');
  });
});

// ============================================================================
// GET Tests - Authentication
// ============================================================================
describe('GET /api/cron/push - Authentication', () => {
  it('should_return_401_when_cron_secret_invalid', async () => {
    // Arrange
    mockEnv({ CRON_SECRET: 'super-secret', TELEGRAM_BOT_TOKEN: 'bot', TELEGRAM_CHAT_ID: 'chat' });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer wrong-secret',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Unauthorized');
  });

  it('should_accept_bearer_token_auth', async () => {
    // Arrange
    mockEnv({
      CRON_SECRET: 'super-secret',
      TELEGRAM_BOT_TOKEN: 'bot',
      TELEGRAM_CHAT_ID: 'chat',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

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

    vi.mocked(getCachedEnrichment).mockResolvedValue({
      category: 'ai',
      bottom_line: 'AI breakthrough',
      signal_score: 9,
    });

    vi.mocked(filterUnpushed).mockResolvedValue(['n_123']);
    vi.mocked(sendPushAll).mockResolvedValue([
      { success: true, channel: 'telegram' },
    ]);
    vi.mocked(markAsPushed).mockResolvedValue(undefined);
    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 10,
      telegram_sent: 8,
      lark_sent: 2,
      failed: 0,
      last_push_at: Date.now() - 10000,
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer super-secret',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_accept_x_cron_secret_header', async () => {
    // Arrange
    mockEnv({
      CRON_SECRET: 'super-secret',
      TELEGRAM_BOT_TOKEN: 'bot',
      TELEGRAM_CHAT_ID: 'chat',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

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

    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 0,
      last_push_at: 0,
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      'x-cron-secret': 'super-secret',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_accept_secret_in_query_params', async () => {
    // Arrange
    mockEnv({
      CRON_SECRET: 'super-secret',
      TELEGRAM_BOT_TOKEN: 'bot',
      TELEGRAM_CHAT_ID: 'chat',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

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

    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 0,
      last_push_at: 0,
    });

    const url = new URL('https://example.com/api/cron/push?secret=super-secret');
    const request = createMockRequest(url.toString(), {});
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_allow_request_when_no_cron_secret_configured', async () => {
    // Arrange
    mockEnv({
      CRON_SECRET: '',
      TELEGRAM_BOT_TOKEN: 'bot',
      TELEGRAM_CHAT_ID: 'chat',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

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

    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 0,
      last_push_at: 0,
    });

    const request = createMockRequest('https://example.com/api/cron/push', {});
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });

    // Assert
    expect(response.status).toBe(200);
  });
});

// ============================================================================
// GET Tests - Channel Configuration
// ============================================================================
describe('GET /api/cron/push - Channel Configuration', () => {
  beforeEach(() => {
    mockEnv({ CRON_SECRET: 'test' });
  });

  it('should_return_400_when_no_channel_configured', async () => {
    // Arrange
    mockEnv({ CRON_SECRET: '' }); // No secret = no auth required
    // No TELEGRAM_* or LARK_* vars

    const request = createMockRequest('https://example.com/api/cron/push');
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('No push channel configured');
  });

  it('should_work_with_telegram_configured', async () => {
    // Arrange
    mockEnv({
      CRON_SECRET: 'test',
      TELEGRAM_BOT_TOKEN: 'bot123',
      TELEGRAM_CHAT_ID: 'chat123',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

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

    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 0,
      last_push_at: 0,
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_work_with_lark_configured', async () => {
    // Arrange
    mockEnv({
      CRON_SECRET: 'test',
      LARK_WEBHOOK_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

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

    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 0,
      last_push_at: 0,
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_work_with_both_channels_configured', async () => {
    // Arrange
    mockEnv({
      CRON_SECRET: 'test',
      TELEGRAM_BOT_TOKEN: 'bot123',
      TELEGRAM_CHAT_ID: 'chat123',
      LARK_WEBHOOK_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

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

    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 0,
      last_push_at: 0,
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });

    // Assert
    expect(response.status).toBe(200);
  });
});

// ============================================================================
// GET Tests - Push Flow
// ============================================================================
describe('GET /api/cron/push - Push Flow', () => {
  beforeEach(() => {
    mockEnv({
      CRON_SECRET: 'test',
      TELEGRAM_BOT_TOKEN: 'bot123',
      TELEGRAM_CHAT_ID: 'chat123',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

    vi.mocked(processRefinery).mockReturnValue({
      articles: mockRefinedArticles,
      stats: {
        total_raw: 2,
        after_dedup: 2,
        after_filter: 2,
        final_count: 2,
        sources: { 'Hacker News': 2 },
        processing_time_ms: 100,
      },
    });

    vi.mocked(getCachedEnrichment).mockResolvedValue({
      category: 'ai',
      bottom_line: 'AI breakthrough',
      signal_score: 9,
      key_insights: ['insight1'],
    });

    // Mock getActiveSources to return default sources
    vi.mocked(getActiveSources).mockResolvedValue([
      {
        id: 1,
        name: 'Hacker News',
        url: 'https://news.ycombinator.com/rss',
        strategy: 'DIRECT',
        rsshub_path: null,
        is_active: 1,
        weight: 1.0,
        reliability_score: 1.0,
        category: 'tech',
      },
    ]);
  });

  it('should_push_high_signal_articles', async () => {
    // Arrange
    vi.mocked(filterUnpushed).mockResolvedValue(['n_123', 'n_456']);
    vi.mocked(sendPushAll).mockResolvedValue([
      { success: true, channel: 'telegram', messageId: '1' },
    ]);
    vi.mocked(markAsPushed).mockResolvedValue(undefined);
    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 2,
      telegram_sent: 2,
      lark_sent: 0,
      failed: 0,
      last_push_at: Date.now(),
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.summary.new_pushes).toBe(2);
    expect(data.summary.telegram_sent).toBe(2);
    expect(data.pushed_articles).toHaveLength(2);
  });

  it('should_filter_by_signal_score', async () => {
    // Arrange
    const mockArticles: RefinedArticle[] = [
      ...mockRefinedArticles,
      {
        id: 'n_low',
        url: 'https://example.com/low',
        title: 'Low Signal Article',
        summary: 'Low signal content.',
        source: 'Test',
        published_at: Math.floor(Date.now() / 1000) - 3600,
        refined_at: Math.floor(Date.now() / 1000),
        signal_score: 0.5,
        language: 'en',
      },
    ];

    vi.mocked(processRefinery).mockReturnValue({
      articles: mockArticles,
      stats: {
        total_raw: 3,
        after_dedup: 3,
        after_filter: 3,
        final_count: 3,
        sources: {},
        processing_time_ms: 0,
      },
    });

    vi.mocked(getCachedEnrichment).mockImplementation(async (kv, url) => {
      if (url.includes('low')) {
        return { category: 'noise', bottom_line: 'Low value', signal_score: 2 };
      }
      return { category: 'ai', bottom_line: 'High value', signal_score: 9 };
    });

    vi.mocked(filterUnpushed).mockResolvedValue(['n_123', 'n_456']);
    vi.mocked(sendPushAll).mockResolvedValue([{ success: true, channel: 'telegram' }]);
    vi.mocked(markAsPushed).mockResolvedValue(undefined);
    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 0,
      last_push_at: 0,
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert - Only high signal articles should be pushed
    expect(data.summary.high_signal).toBe(2); // 2 articles with score >= 8
  });

  it('should_filter_out_noise_category', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue({
      category: 'noise',
      bottom_line: 'Marketing content',
      signal_score: 9,
    });

    vi.mocked(filterUnpushed).mockResolvedValue([]);
    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 0,
      last_push_at: 0,
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(data.summary.high_signal).toBe(0); // noise filtered out
    expect(data.summary.new_pushes).toBe(0);
  });

  it('should_limit_max_pushes_per_run', async () => {
    // Arrange
    const manyArticles = Array.from({ length: 20 }, (_, i) => ({
      id: `n_${i}`,
      url: `https://example.com/article${i}`,
      title: `Article ${i}`,
      summary: `Content ${i}`,
      source: 'Test',
      published_at: Math.floor(Date.now() / 1000) - 3600,
      refined_at: Math.floor(Date.now() / 1000),
      signal_score: 0.9,
      language: 'en',
    }));

    vi.mocked(processRefinery).mockReturnValue({
      articles: manyArticles,
      stats: {
        total_raw: 20,
        after_dedup: 20,
        after_filter: 20,
        final_count: 20,
        sources: {},
        processing_time_ms: 0,
      },
    });

    vi.mocked(getCachedEnrichment).mockResolvedValue({
      category: 'ai',
      bottom_line: 'Test',
      signal_score: 9,
    });

    vi.mocked(filterUnpushed).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => `n_${i}`)
    );
    vi.mocked(sendPushAll).mockResolvedValue([{ success: true, channel: 'telegram' }]);
    vi.mocked(markAsPushed).mockResolvedValue(undefined);
    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 10,
      telegram_sent: 10,
      lark_sent: 0,
      failed: 0,
      last_push_at: Date.now(),
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert - MAX_PUSHES_PER_RUN is 10
    expect(data.summary.new_pushes).toBeLessThanOrEqual(10);
  });

  it('should_return_success_with_no_new_pushes', async () => {
    // Arrange
    vi.mocked(filterUnpushed).mockResolvedValue([]);
    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 100,
      telegram_sent: 80,
      lark_sent: 20,
      failed: 5,
      last_push_at: Date.now() - 3600000,
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.summary.new_pushes).toBe(0);
    expect(data.summary.telegram_sent).toBe(0);
    expect(data.stats).toEqual({
      total_pushed: 100,
      telegram_sent: 80,
      lark_sent: 20,
      failed: 5,
      last_push_at: expect.any(Number),
    });
  });

  it('should_handle_push_failure', async () => {
    // Arrange
    vi.mocked(filterUnpushed).mockResolvedValue(['n_123']);
    vi.mocked(sendPushAll).mockResolvedValue([
      { success: false, channel: 'telegram', error: 'Network error' },
    ]);
    vi.mocked(recordFailure).mockResolvedValue(undefined);
    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 1,
      last_push_at: Date.now(),
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.summary.failed).toBe(1);
    expect(recordFailure).toHaveBeenCalled();
  });
});

// ============================================================================
// GET Tests - Error Handling
// ============================================================================
describe('GET /api/cron/push - Error Handling', () => {
  beforeEach(() => {
    mockEnv({
      CRON_SECRET: 'test',
      TELEGRAM_BOT_TOKEN: 'bot123',
      TELEGRAM_CHAT_ID: 'chat123',
    });

    // Mock getActiveSources to return default sources
    vi.mocked(getActiveSources).mockResolvedValue([
      {
        id: 1,
        name: 'Hacker News',
        url: 'https://news.ycombinator.com/rss',
        strategy: 'DIRECT',
        rsshub_path: null,
        is_active: 1,
        weight: 1.0,
        reliability_score: 1.0,
        category: 'tech',
      },
    ]);

    // Set up default processRefinery mock (returns empty articles)
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
  });

  it('should_handle_rss_fetch_error', async () => {
    // Arrange
    mockFetch.mockRejectedValue(new Error('Network error'));

    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 0,
      last_push_at: 0,
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });

    // Assert - Should still complete, just with 0 fetched
    expect(response.status).toBe(200);
  });

  it('should_return_500_on_unexpected_error', async () => {
    // Arrange
    vi.mocked(processRefinery).mockImplementation(() => {
      throw new Error('Unexpected processing error');
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Unexpected processing error');
  });

  it('should_handle_invalid_rss_response', async () => {
    // Arrange
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => 'Invalid RSS content',
    });

    vi.mocked(isValidRssContent).mockReturnValue(false);

    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 0,
      last_push_at: 0,
    });

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.summary.total_fetched).toBe(0);
  });
});

// ============================================================================
// GET Tests - Time Window Filtering
// ============================================================================
describe('GET /api/cron/push - Time Window Filtering', () => {
  beforeEach(() => {
    mockEnv({
      CRON_SECRET: 'test',
      TELEGRAM_BOT_TOKEN: 'bot123',
      TELEGRAM_CHAT_ID: 'chat123',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => mockRSSFeed,
    });

    vi.mocked(getStats).mockResolvedValue({
      total_pushed: 0,
      telegram_sent: 0,
      lark_sent: 0,
      failed: 0,
      last_push_at: 0,
    });

    // Mock getActiveSources to return default sources
    vi.mocked(getActiveSources).mockResolvedValue([
      {
        id: 1,
        name: 'Hacker News',
        url: 'https://news.ycombinator.com/rss',
        strategy: 'DIRECT',
        rsshub_path: null,
        is_active: 1,
        weight: 1.0,
        reliability_score: 1.0,
        category: 'tech',
      },
    ]);
  });

  it('should_only_include_articles_within_time_window', async () => {
    // Arrange
    const now = Date.now();
    const fiveHoursAgo = Math.floor((now - 5 * 3600 * 1000) / 1000);
    const twoHoursAgo = Math.floor((now - 2 * 3600 * 1000) / 1000);

    const mixedArticles: RefinedArticle[] = [
      {
        id: 'n_old',
        url: 'https://example.com/old',
        title: 'Old Article',
        summary: 'Old content',
        source: 'Test',
        published_at: fiveHoursAgo, // Outside 4-hour window
        refined_at: Math.floor(now / 1000),
        signal_score: 0.9,
        language: 'en',
      },
      {
        id: 'n_new',
        url: 'https://example.com/new',
        title: 'New Article',
        summary: 'New content',
        source: 'Test',
        published_at: twoHoursAgo, // Within 4-hour window
        refined_at: Math.floor(now / 1000),
        signal_score: 0.9,
        language: 'en',
      },
    ];

    vi.mocked(processRefinery).mockReturnValue({
      articles: mixedArticles,
      stats: {
        total_raw: 2,
        after_dedup: 2,
        after_filter: 2,
        final_count: 2,
        sources: {},
        processing_time_ms: 0,
      },
    });

    vi.mocked(getCachedEnrichment).mockResolvedValue({
      category: 'ai',
      bottom_line: 'Test',
      signal_score: 9,
    });

    vi.mocked(filterUnpushed).mockResolvedValue(['n_new']);
    vi.mocked(sendPushAll).mockResolvedValue([{ success: true, channel: 'telegram' }]);
    vi.mocked(markAsPushed).mockResolvedValue(undefined);

    const request = createMockRequest('https://example.com/api/cron/push', {
      authorization: 'Bearer test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await GET({ locals, request });
    const data = await response.json();

    // Assert - after_filter is in summary
    expect(data.summary.after_filter).toBe(1); // Only new article
  });
});
