/**
 * News API Worker 测试套件
 *
 * 测试策略:
 * 1. 使用 vitest + node 环境，手动 mock D1 bindings
 * 2. Mock D1 数据库操作
 * 3. 测试所有端点的正常流程和边界情况
 * 4. 测试鉴权、错误处理、数据验证
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from './index';
import { Hono } from 'hono';

// ============================================
// Type Definitions
// ============================================

type MockEnv = {
  DB: D1Database;
  API_SECRET: string;
  ALLOWED_ORIGINS: string;
};

// ============================================
// Mock Utilities
// ============================================

/**
 * 创建 Mock D1 Statement
 * 模拟 D1 statement 的链式调用: prepare().bind().run()/.first()/.all()
 */
const createMockStatement = () => {
  const mockRun = vi.fn().mockResolvedValue({ meta: { changes: 0 } });
  const mockFirst = vi.fn().mockResolvedValue(null);
  const mockAll = vi.fn().mockResolvedValue({ results: [] });
  const mockBind = vi.fn().mockReturnValue({
    run: mockRun,
    first: mockFirst,
    all: mockAll,
  });

  return {
    bind: mockBind,
    run: mockRun,
    first: mockFirst,
    all: mockAll,
    // 用于测试时设置返回值
    _setRunResult: (result: { meta: { changes: number } }) => {
      mockRun.mockResolvedValue(result);
    },
    _setFirstResult: (result: Record<string, unknown> | null) => {
      mockFirst.mockResolvedValue(result);
    },
    _setAllResults: (results: unknown[]) => {
      mockAll.mockResolvedValue({ results });
    },
    _getBoundValues: () => (mockBind.mock.calls.at(-1) || []) as unknown[],
  };
};

/**
 * 创建 Mock D1 Database
 */
const createMockDB = () => {
  const mockPrepare = vi.fn(() => createMockStatement());

  return {
    prepare: mockPrepare,
    // 测试辅助方法
    _getStatementCallCount: () => mockPrepare.mock.calls.length,
    _getLastSQL: () => mockPrepare.mock.calls.at(-1)?.[0] as string | undefined,
    _reset: () => mockPrepare.mockReset(),
  };
};

/**
 * 创建 Mock 环境
 */
const createMockEnv = (): MockEnv => ({
  DB: createMockDB() as unknown as D1Database,
  API_SECRET: 'test-secret-key',
  ALLOWED_ORIGINS: '*', // 开发环境允许所有来源
});

// ============================================
// Test Request Helper
// ============================================

/**
 * 发送测试请求
 */
async function makeRequest(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
  env: MockEnv
): Promise<Response> {
  const { method = 'GET', headers = {}, body } = options;

  // 解析查询参数
  const [basePath, queryString] = path.split('?');
  const url = new URL(basePath, 'https://test.example.com');

  if (queryString) {
    new URLSearchParams(queryString).forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    requestInit.body = JSON.stringify(body);
  }

  const req = new Request(url, requestInit);

  // 创建 Hono 实例处理请求
  const testApp = new Hono<{ Bindings: MockEnv }>();
  testApp.route('/', app);

  return testApp.fetch(req, env);
}

// ============================================
// Test Suites
// ============================================

describe('GET / - Health Check', () => {
  it('should return ok status', async () => {
    const env = createMockEnv();
    const response = await makeRequest('/', {}, env);

    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toEqual({
      status: 'ok',
      message: 'News API is running',
    });
  });

  it('should handle CORS preflight', async () => {
    const env = createMockEnv();
    const url = new URL('/', 'https://test.example.com');
    const req = new Request(url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });

    const testApp = new Hono<{ Bindings: MockEnv }>();
    testApp.route('/', app);
    const response = await testApp.fetch(req, env);

    expect(response.status).toBe(204);
  });
});

describe('CORS Configuration', () => {
  let mockEnv: MockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  it('should allow origin when ALLOWED_ORIGINS is *', async () => {
    const response = await makeRequest('/', {}, mockEnv);

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should restrict origin when ALLOWED_ORIGINS is specific', async () => {
    mockEnv.ALLOWED_ORIGINS = 'https://example.com';
    const url = new URL('/', 'https://test.example.com');
    const req = new Request(url, {
      method: 'GET',
      headers: {
        Origin: 'https://example.com',
      },
    });

    const testApp = new Hono<{ Bindings: MockEnv }>();
    testApp.route('/', app);
    const response = await testApp.fetch(req, mockEnv);

    // Should return the allowed origin
    expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
  });

  it('should return first allowed origin when request origin is not in list', async () => {
    mockEnv.ALLOWED_ORIGINS = 'https://example.com,https://app.example.com';
    const url = new URL('/', 'https://test.example.com');
    const req = new Request(url, {
      method: 'GET',
      headers: {
        Origin: 'https://malicious.com',
      },
    });

    const testApp = new Hono<{ Bindings: MockEnv }>();
    testApp.route('/', app);
    const response = await testApp.fetch(req, mockEnv);

    // Should return the first allowed origin, not the malicious one
    expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
  });
});

describe('POST /add - Add Articles', () => {
  let mockEnv: MockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should reject request without API key', async () => {
      const response = await makeRequest(
        '/add',
        {
          method: 'POST',
          body: [],
        },
        mockEnv
      );

      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should reject request with wrong API key', async () => {
      const response = await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'wrong-secret',
          },
          body: [],
        },
        mockEnv
      );

      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should accept request with valid API key', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setRunResult({ meta: { changes: 1 } });
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const response = await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'test-secret-key',
          },
          body: [
            {
              title: 'Test Article',
              url: 'https://example.com/test',
              source: 'test-source',
              external_id: 'test-123',
            },
          ],
        },
        mockEnv
      );

      expect(response.status).not.toBe(401);
    });
  });

  describe('Input Validation', () => {
    it('should reject non-array request body', async () => {
      const response = await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'test-secret-key',
          },
          body: { not: 'an array' },
        },
        mockEnv
      );

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json).toEqual({
        error: 'Request body must be an array',
      });
    });

    it('should enforce maximum articles per request', async () => {
      const tooManyArticles = Array.from({ length: 1001 }, (_, i) => ({
        title: `Article ${i}`,
        url: `https://example.com/${i}`,
        source: 'test',
        external_id: `ext-${i}`,
      }));

      const response = await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'test-secret-key',
          },
          body: tooManyArticles,
        },
        mockEnv
      );

      expect(response.status).toBe(413);

      const json = await response.json();
      expect(json.error).toContain('Maximum 1000 articles');
      expect(json.limit).toBe(1000);
    });

    it('should accept exactly 1000 articles', async () => {
      const maxArticles = Array.from({ length: 1000 }, (_, i) => ({
        title: `Article ${i}`,
        url: `https://example.com/${i}`,
        source: 'test',
        external_id: `ext-${i}`,
      }));

      const mockStmt = createMockStatement();
      mockStmt._setRunResult({ meta: { changes: 1 } });
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const response = await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'test-secret-key',
          },
          body: maxArticles,
        },
        mockEnv
      );

      expect(response.status).not.toBe(413);
    });

    it('should skip articles missing required fields', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setRunResult({ meta: { changes: 0 } });
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const response = await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'test-secret-key',
          },
          body: [
            {
              title: 'Missing url',
              source: 'test',
              external_id: '123',
            },
          ],
        },
        mockEnv
      );

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.inserted).toBe(0);
      expect(json.skipped).toBe(1);
    });
  });

  describe('Happy Path', () => {
    it('should insert single article successfully', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setRunResult({ meta: { changes: 1 } });
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const article = {
        title: 'Test Article',
        url: 'https://example.com/test',
        source: 'test-source',
        summary: 'Test summary',
        external_id: 'ext-123',
        created_at: 1704067200,
      };

      const response = await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'test-secret-key',
          },
          body: [article],
        },
        mockEnv
      );

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toEqual({
        success: true,
        inserted: 1,
        skipped: 0,
      });

      // Verify bind was called with correct values
      const boundValues = mockStmt._getBoundValues();
      expect(boundValues).toEqual([
        article.title,
        article.url,
        article.source,
        article.summary,
        article.created_at,
        article.external_id,
      ]);
    });

    it('should use default created_at when not provided (nullish coalescing)', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setRunResult({ meta: { changes: 1 } });
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const article = {
        title: 'Test Article',
        url: 'https://example.com/test',
        source: 'test-source',
        external_id: 'ext-123',
        created_at: undefined,
      };

      await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'test-secret-key',
          },
          body: [article],
        },
        mockEnv
      );

      const boundValues = mockStmt._getBoundValues();
      // Should be a Unix timestamp close to now
      expect(boundValues[4]).toBeTypeOf('number');
      expect(boundValues[4]).toBeGreaterThan(1700000000);
    });

    it('should handle created_at of 0 correctly (nullish coalescing)', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setRunResult({ meta: { changes: 1 } });
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const article = {
        title: 'Test Article',
        url: 'https://example.com/test',
        source: 'test-source',
        external_id: 'ext-123',
        created_at: 0,
      };

      await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'test-secret-key',
          },
          body: [article],
        },
        mockEnv
      );

      const boundValues = mockStmt._getBoundValues();
      // With ??, 0 should be preserved
      expect(boundValues[4]).toBe(0);
    });

    it('should handle duplicate articles (INSERT OR IGNORE)', async () => {
      const mockStmt = createMockStatement();
      // First call: changes=1, second call: changes=0 (duplicate)
      let callCount = 0;
      mockStmt.run = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { meta: { changes: 1 } };
        } else {
          return { meta: { changes: 0 } };
        }
      });
      mockStmt.bind = vi.fn(() => mockStmt);

      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const response = await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'test-secret-key',
          },
          body: [
            {
              title: 'Article 1',
              url: 'https://example.com/1',
              source: 'source1',
              external_id: 'ext-1',
            },
            {
              title: 'Article 2',
              url: 'https://example.com/2',
              source: 'source2',
              external_id: 'ext-2',
            },
          ],
        },
        mockEnv
      );

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.inserted).toBe(1);
      expect(json.skipped).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockStmt = createMockStatement();
      mockStmt.run = vi.fn().mockRejectedValue(new Error('Database connection failed'));
      mockStmt.bind = vi.fn(() => mockStmt);

      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const response = await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'test-secret-key',
          },
          body: [
            {
              title: 'Test Article',
              url: 'https://example.com',
              source: 'test',
              external_id: '123',
            },
          ],
        },
        mockEnv
      );

      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.error).toBe('Internal server error');
      expect(json.message).toBeUndefined(); // Should not leak error details
    });

    it('should handle invalid JSON in request body', async () => {
      const url = new URL('/add', 'https://test.example.com');
      const req = new Request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-secret-key',
        },
        body: 'invalid json{{',
      });

      const testApp = new Hono<{ Bindings: MockEnv }>();
      testApp.route('/', app);

      const response = await testApp.fetch(req, mockEnv);

      // Invalid JSON throws an error, caught by catch block, returns 500
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Internal server error');
    });
  });

  describe('Performance - Parallel Execution', () => {
    it('should use Promise.all for parallel inserts', async () => {
      const mockStmt = createMockStatement();
      let maxConcurrent = 0;
      let currentRunning = 0;

      mockStmt.run = vi.fn().mockImplementation(async () => {
        currentRunning++;
        if (currentRunning > maxConcurrent) {
          maxConcurrent = currentRunning;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
        currentRunning--;
        return { meta: { changes: 1 } };
      });
      mockStmt.bind = vi.fn(() => mockStmt);

      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const articles = Array.from({ length: 10 }, (_, i) => ({
        title: `Article ${i}`,
        url: `https://example.com/${i}`,
        source: 'test',
        external_id: `ext-${i}`,
      }));

      await makeRequest(
        '/add',
        {
          method: 'POST',
          headers: {
            'x-api-key': 'test-secret-key',
          },
          body: articles,
        },
        mockEnv
      );

      // With Promise.all, all 10 should run in parallel
      expect(maxConcurrent).toBe(10);
    });
  });
});

describe('GET /latest - Get Latest Articles', () => {
  let mockEnv: MockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  describe('Query Parameters', () => {
    it('should use default pagination (page=1, limit=50)', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setAllResults([]);
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const response = await makeRequest('/latest', {}, mockEnv);

      expect(response.status).toBe(200);

      const boundValues = mockStmt._getBoundValues();
      expect(boundValues).toEqual([50, 0]); // limit=50, offset=0
    });

    it('should parse custom page parameter', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setAllResults([]);
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      await makeRequest('/latest?page=3', {}, mockEnv);

      const boundValues = mockStmt._getBoundValues();
      expect(boundValues).toEqual([50, 100]); // offset = (3-1) * 50
    });

    it('should enforce maximum limit of 100', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setAllResults([]);
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      await makeRequest('/latest?limit=200', {}, mockEnv);

      const boundValues = mockStmt._getBoundValues();
      expect(boundValues).toEqual([100, 0]); // Capped at 100
    });

    it('should handle negative page parameter', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setAllResults([]);
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      await makeRequest('/latest?page=-5', {}, mockEnv);

      const boundValues = mockStmt._getBoundValues();
      expect(boundValues).toEqual([50, 0]); // page clamped to 1
    });

    it('should handle non-numeric parameters', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setAllResults([]);
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      await makeRequest('/latest?page=abc&limit=xyz', {}, mockEnv);

      const boundValues = mockStmt._getBoundValues();
      expect(boundValues).toEqual([50, 0]); // Falls back to defaults
    });

    it('should handle combined page and limit parameters', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setAllResults([]);
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      await makeRequest('/latest?page=5&limit=20', {}, mockEnv);

      const boundValues = mockStmt._getBoundValues();
      expect(boundValues).toEqual([20, 80]); // offset = (5-1) * 20
    });
  });

  describe('Happy Path', () => {
    it('should return articles with metadata', async () => {
      const mockStmt = createMockStatement();
      const mockArticles = [
        {
          id: 1,
          title: 'First Article',
          url: 'https://example.com/1',
          source: 'source1',
          summary: 'Summary 1',
          created_at: 1704067200,
          external_id: 'ext-1',
        },
        {
          id: 2,
          title: 'Second Article',
          url: 'https://example.com/2',
          source: 'source2',
          summary: 'Summary 2',
          created_at: 1704067100,
          external_id: 'ext-2',
        },
      ];
      mockStmt._setAllResults(mockArticles);
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const response = await makeRequest('/latest', {}, mockEnv);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toEqual({
        success: true,
        count: 2,
        page: 1,
        limit: 50,
        hasMore: false, // count (2) < limit (50)
        data: mockArticles,
      });
    });

    it('should set hasMore=true when results equal limit', async () => {
      const mockStmt = createMockStatement();
      const mockArticles = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        title: `Article ${i + 1}`,
        url: `https://example.com/${i + 1}`,
        source: 'test',
        summary: '',
        created_at: 1704067200 - i,
        external_id: `ext-${i + 1}`,
      }));
      mockStmt._setAllResults(mockArticles);
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const response = await makeRequest('/latest?limit=50', {}, mockEnv);

      const json = await response.json();
      expect(json.hasMore).toBe(true);
      expect(json.count).toBe(50);
    });

    it('should handle empty result set', async () => {
      const mockStmt = createMockStatement();
      mockStmt._setAllResults([]);
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const response = await makeRequest('/latest', {}, mockEnv);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toEqual({
        success: true,
        count: 0,
        page: 1,
        limit: 50,
        hasMore: false,
        data: [],
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockStmt = createMockStatement();
      mockStmt.all = vi.fn().mockRejectedValue(new Error('Query timeout'));
      mockStmt.bind = vi.fn(() => mockStmt);
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const response = await makeRequest('/latest', {}, mockEnv);

      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.error).toBe('Internal server error');
      expect(json.message).toBeUndefined(); // Should not leak error details
    });
  });
});

describe('GET /stats - Get Statistics', () => {
  let mockEnv: MockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should return complete statistics', async () => {
      let prepareCallCount = 0;
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => {
        prepareCallCount++;
        const stmt = createMockStatement();

        // First call: COUNT(*)
        if (prepareCallCount === 1) {
          stmt._setFirstResult({ count: 100 });
        }
        // Second call: GROUP BY source
        else if (prepareCallCount === 2) {
          stmt._setAllResults([
            { source: 'source1', count: 50 },
            { source: 'source2', count: 30 },
            { source: 'source3', count: 20 },
          ]);
        }
        // Third call: latest created_at
        else if (prepareCallCount === 3) {
          stmt._setFirstResult({ created_at: 1704067200 });
        }

        return stmt;
      });

      const response = await makeRequest('/stats', {}, mockEnv);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toEqual({
        success: true,
        totalArticles: 100,
        bySource: [
          { source: 'source1', count: 50 },
          { source: 'source2', count: 30 },
          { source: 'source3', count: 20 },
        ],
        latestArticleAt: 1704067200,
      });
    });

    it('should handle empty database', async () => {
      let prepareCallCount = 0;
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => {
        prepareCallCount++;
        const stmt = createMockStatement();

        if (prepareCallCount === 1) {
          stmt._setFirstResult(null);
        } else if (prepareCallCount === 2) {
          stmt._setAllResults([]);
        } else if (prepareCallCount === 3) {
          stmt._setFirstResult(null);
        }

        return stmt;
      });

      const response = await makeRequest('/stats', {}, mockEnv);

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toEqual({
        success: true,
        totalArticles: 0,
        bySource: [],
        latestArticleAt: null,
      });
    });
  });

  describe('Performance - Parallel Execution', () => {
    it('should use Promise.all for parallel queries', async () => {
      let maxConcurrent = 0;
      let currentRunning = 0;

      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => {
        const stmt = createMockStatement();

        const mockFirst = vi.fn().mockImplementation(async () => {
          currentRunning++;
          if (currentRunning > maxConcurrent) {
            maxConcurrent = currentRunning;
          }
          await new Promise(resolve => setTimeout(resolve, 10));
          currentRunning--;
          return { count: 100 };
        });

        const mockAll = vi.fn().mockImplementation(async () => {
          currentRunning++;
          if (currentRunning > maxConcurrent) {
            maxConcurrent = currentRunning;
          }
          await new Promise(resolve => setTimeout(resolve, 10));
          currentRunning--;
          return { results: [] };
        });

        stmt.first = mockFirst;
        stmt.all = mockAll;

        return stmt;
      });

      await makeRequest('/stats', {}, mockEnv);

      // With Promise.all, all 3 queries should run in parallel
      expect(maxConcurrent).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle total count query failure', async () => {
      const mockStmt = createMockStatement();
      mockStmt.first = vi.fn().mockRejectedValue(new Error('Count query failed'));
      mockStmt.bind = vi.fn(() => mockStmt);
      (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

      const response = await makeRequest('/stats', {}, mockEnv);

      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.error).toBe('Internal server error');
      expect(json.message).toBeUndefined(); // Should not leak error details
    });
  });
});

describe('Integration Tests - Full Workflows', () => {
  let mockEnv: MockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  it('should handle complete workflow: add -> stats -> latest', async () => {
    // 1. Add articles
    let prepareCallCount = 0;
    (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => {
      prepareCallCount++;
      const stmt = createMockStatement();

      // Add articles (first prepare call)
      if (prepareCallCount === 1) {
        stmt._setRunResult({ meta: { changes: 1 } });
      }
      // Stats queries run in parallel
      else if (prepareCallCount >= 2 && prepareCallCount <= 4) {
        if (prepareCallCount === 2) stmt._setFirstResult({ count: 1 });
        if (prepareCallCount === 3) stmt._setAllResults([{ source: 'integration-test', count: 1 }]);
        if (prepareCallCount === 4) stmt._setFirstResult({ created_at: 1704067200 });
      }
      // Latest articles
      else if (prepareCallCount === 5) {
        stmt._setAllResults([
          {
            id: 1,
            title: 'Integration Test Article',
            url: 'https://example.com/integration',
            source: 'integration-test',
            summary: '',
            created_at: 1704067200,
            external_id: 'integration-123',
          },
        ]);
      }

      return stmt;
    });

    const addResponse = await makeRequest(
      '/add',
      {
        method: 'POST',
        headers: {
          'x-api-key': 'test-secret-key',
        },
        body: [
          {
            title: 'Integration Test Article',
            url: 'https://example.com/integration',
            source: 'integration-test',
            external_id: 'integration-123',
          },
        ],
      },
      mockEnv
    );

    expect(addResponse.status).toBe(200);
    expect((await addResponse.json()).inserted).toBe(1);

    // 2. Check stats
    const statsResponse = await makeRequest('/stats', {}, mockEnv);
    expect(statsResponse.status).toBe(200);

    // 3. Get latest articles
    const latestResponse = await makeRequest('/latest', {}, mockEnv);
    expect(latestResponse.status).toBe(200);
    const latestJson = await latestResponse.json();
    expect(latestJson.count).toBe(1);
  });
});

describe('Edge Cases and Chaos Testing', () => {
  let mockEnv: MockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  it('should handle very long article titles', async () => {
    const mockStmt = createMockStatement();
    mockStmt._setRunResult({ meta: { changes: 1 } });
    (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

    const longTitle = 'A'.repeat(10000);

    const response = await makeRequest(
      '/add',
      {
        method: 'POST',
        headers: {
          'x-api-key': 'test-secret-key',
        },
        body: [
          {
            title: longTitle,
            url: 'https://example.com/long',
            source: 'test',
            external_id: 'long-title-123',
          },
        ],
      },
      mockEnv
    );

    expect(response.status).toBe(200);
  });

  it('should handle special characters in article content', async () => {
    const mockStmt = createMockStatement();
    mockStmt._setRunResult({ meta: { changes: 1 } });
    (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

    const specialArticle = {
      title: 'Test with "quotes" and \'apostrophes\' and <tags>',
      url: 'https://example.com/special?param=value&other=123',
      source: 'test-source',
      summary: 'Summary with emojis 🎉 and unicode 中文 and special chars \n\t\r',
      external_id: 'special-123',
    };

    const response = await makeRequest(
      '/add',
      {
        method: 'POST',
        headers: {
          'x-api-key': 'test-secret-key',
        },
        body: [specialArticle],
      },
      mockEnv
    );

    expect(response.status).toBe(200);

    const boundValues = mockStmt._getBoundValues();
    expect(boundValues[0]).toBe(specialArticle.title);
    expect(boundValues[1]).toBe(specialArticle.url);
    expect(boundValues[3]).toBe(specialArticle.summary);
  });

  it('should handle negative created_at timestamp', async () => {
    const mockStmt = createMockStatement();
    mockStmt._setRunResult({ meta: { changes: 1 } });
    (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

    const response = await makeRequest(
      '/add',
      {
        method: 'POST',
        headers: {
          'x-api-key': 'test-secret-key',
        },
        body: [
          {
            title: 'Negative Time Article',
            url: 'https://example.com',
            source: 'test',
            external_id: 'negative-123',
            created_at: -86400, // One day before epoch
          },
        ],
      },
      mockEnv
    );

    expect(response.status).toBe(200);

    const boundValues = mockStmt._getBoundValues();
    expect(boundValues[4]).toBe(-86400);
  });

  it('should handle large page numbers', async () => {
    const mockStmt = createMockStatement();
    mockStmt._setAllResults([]);
    (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

    const response = await makeRequest('/latest?page=999999', {}, mockEnv);

    expect(response.status).toBe(200);

    const boundValues = mockStmt._getBoundValues();
    // Should still work, just return empty results
    expect(boundValues[1]).toBe((999999 - 1) * 50); // Large offset
  });

  it('should handle zero limit parameter', async () => {
    const mockStmt = createMockStatement();
    mockStmt._setAllResults([]);
    (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

    const response = await makeRequest('/latest?limit=0', {}, mockEnv);

    expect(response.status).toBe(200);

    const boundValues = mockStmt._getBoundValues();
    // parseInt('0', 10) || 50 = 50
    expect(boundValues[0]).toBe(50);
  });

  it('should handle null summary correctly', async () => {
    const mockStmt = createMockStatement();
    mockStmt._setRunResult({ meta: { changes: 1 } });
    (mockEnv.DB as ReturnType<typeof createMockDB>).prepare = vi.fn(() => mockStmt);

    const response = await makeRequest(
      '/add',
      {
        method: 'POST',
        headers: {
          'x-api-key': 'test-secret-key',
        },
        body: [
          {
            title: 'No Summary',
            url: 'https://example.com',
            source: 'test',
            external_id: 'no-summary',
            summary: null,
          },
        ],
      },
      mockEnv
    );

    expect(response.status).toBe(200);

    const boundValues = mockStmt._getBoundValues();
    // With ??, null should become empty string
    expect(boundValues[3]).toBe('');
  });
});
