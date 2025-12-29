/**
 * Test Setup - Common Mock Helpers for Cloudflare Workers/Pages Testing
 *
 * This module provides reusable mock factories for:
 * - KV Namespace
 * - D1 Database
 * - R2 Object Store
 * - Astro Locals
 * - Request objects
 *
 * Usage:
 *   import { createMockKV, createMockD1, createMockLocals } from '@/test-setup';
 */

import { vi } from 'vitest';

// ============================================================================
// KV Namespace Mock
// ============================================================================

export interface MockKV {
  get: ReturnType<typeof vi.fn<ReturnType<KVNamespace['get']>>>;
  put: ReturnType<typeof vi.fn<ReturnType<KVNamespace['put']>>>;
  delete: ReturnType<typeof vi.fn<ReturnType<KVNamespace['delete']>>>;
  list: ReturnType<typeof vi.fn<ReturnType<KVNamespace['list']>>>;
}

export function createMockKV(): MockKV {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  };
}

/**
 * Create a KV mock with in-memory storage
 */
export function createInMemoryKV(): MockKV & { _store: Map<string, string> } {
  const store = new Map<string, string>();

  return {
    _store: store,

    get: vi.fn(async (key: string) => {
      return store.get(key) ?? null;
    }),

    put: vi.fn(async (key: string, value: string, options?: KVNamespacePutOptions) => {
      store.set(key, value);
      if (options?.expirationTtl) {
        // In a real implementation, would handle TTL
        // For tests, we just store the value
      }
    }),

    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),

    list: vi.fn(async () => {
      const keys = Array.from(store.keys());
      return {
        keys: keys.map(k => ({ name: k })),
        list_complete: true,
      };
    }),
  };
}

// ============================================================================
// D1 Database Mock
// ============================================================================

export interface MockD1PreparedStatement {
  bind: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

export interface MockD1 {
  prepare: ReturnType<typeof vi.fn<MockD1PreparedStatement>>;
}

export function createMockD1(): MockD1 {
  const prepare = vi.fn(() => {
    const stmt: MockD1PreparedStatement = {
      bind: vi.fn(() => stmt),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
    return stmt;
  });

  return { prepare };
}

/**
 * Create a D1 mock with in-memory storage
 */
export function createInMemoryD1(): MockD1 & { _data: Record<string, any[]> } {
  const data: Record<string, any[]> = {
    intelligence_sources: [],
    // Add other tables as needed
  };

  const prepare = vi.fn((sql: string) => {
    // Simple SQL parser for common patterns
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
    const table = selectMatch?.[2];

    const stmt: MockD1PreparedStatement = {
      bind: vi.fn(function(this: MockD1PreparedStatement, ...values: any[]) {
        (this as any)._boundValues = values;
        return this;
      }),

      first: vi.fn(function(this: MockD1PreparedStatement) {
        if (table && data[table]) {
          return Promise.resolve(data[table][0] ?? null);
        }
        return Promise.resolve(null);
      }),

      all: vi.fn(function(this: MockD1PreparedStatement) {
        if (table && data[table]) {
          return Promise.resolve({ results: data[table] });
        }
        return Promise.resolve({ results: [] });
      }),

      run: vi.fn(function(this: MockD1PreparedStatement) {
        return Promise.resolve({ meta: { changes: 1 } });
      }),
    };
    return stmt;
  });

  return { prepare, _data: data };
}

// ============================================================================
// R2 Object Store Mock
// ============================================================================

export interface MockR2 {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
}

export function createMockR2(): MockR2 {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  };
}

// ============================================================================
// Astro Locals Mock
// ============================================================================

export interface MockLocalsOptions {
  kv?: MockKV | null;
  d1?: MockD1 | null;
  r2?: MockR2 | null;
  env?: Record<string, any>;
}

export function createMockLocals(options: MockLocalsOptions = {}): App.Locals {
  const { kv = null, d1 = null, r2 = null, env = {} } = options;

  return {
    runtime: {
      env: {
        KV: kv,
        INTELLIGENCE_DB: d1,
        R2: r2,
        NODE_ENV: 'test',
        SESSION_SECRET: 'test-session-secret',
        SITE_PASSWORD_HASH: 'test-user-hash',
        ADMIN_PASSWORD_HASH: 'test-admin-hash',
        ...env,
      },
    },
  };
}

// ============================================================================
// Request Mock Helpers
// ============================================================================

export function createMockRequest(options: {
  body?: any;
  method?: string;
  headers?: Record<string, string>;
  url?: string;
}): Partial<Request> {
  const { body = null, method = 'POST', headers = {}, url = 'https://example.com' } = options;

  return {
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
    method,
    headers: new Headers(headers),
    url,
    cf: {
      colo: 'LAX',
      country: 'US',
    } as any,
  } as Partial<Request>;
}

export function createMockUrl(searchParams: Record<string, string> = {}): URL {
  const url = new URL('https://example.com');
  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
}

// ============================================================================
// Astro Cookies Mock
// ============================================================================

export interface MockCookies {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  _store: Map<string, any>;
}

export function createMockCookies(): MockCookies {
  const store = new Map<string, any>();

  return {
    _store: store,

    get: vi.fn((name: string) => {
      return store.get(name);
    }),

    set: vi.fn((name: string, value: string, options?: any) => {
      store.set(name, { value, options });
    }),

    delete: vi.fn((name: string, options?: any) => {
      store.delete(name);
    }),
  };
}

// ============================================================================
// Response Mock Helpers
// ============================================================================

export async function parseJsonResponse(response: Response): Promise<any> {
  return await response.json();
}

// ============================================================================
// Fetch Mock Helper
// ============================================================================

export function mockGlobalFetch(response: Response | string | object) {
  const resp = typeof response === 'string'
    ? new Response(response)
    : response instanceof Response
    ? response
    : new Response(JSON.stringify(response), {
        headers: { 'content-type': 'application/json' },
      });

  return vi.spyOn(global, 'fetch').mockResolvedValue(resp);
}

export function mockGlobalFetchError(error: string) {
  return vi.spyOn(global, 'fetch').mockRejectedValue(new Error(error));
}

// ============================================================================
// Sleep Helper for testing delays
// ============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Common test data
// ============================================================================

export const MOCK_ENV = {
  SESSION_SECRET: 'test-session-secret-32-char-hex',
  SITE_PASSWORD_HASH: 'test-user-password-hash',
  ADMIN_PASSWORD_HASH: 'test-admin-password-hash',
  NODE_ENV: 'test',
  RSSHUB_BASE_URL: 'https://test-rsshub.example.com',
  FINNHUB_API_KEY: 'test-finnhub-key',
  FMP_API_KEY: 'test-fmp-key',
  POLYGON_API_KEY: 'test-polygon-key',
  LLM_BASE_URL: 'https://test-llm.example.com',
  LLM_API_KEY: 'test-llm-key',
  LLM_MODEL: 'test-model',
  APIFY_TOKEN: 'test-apify-token',
  CRON_SECRET: 'test-cron-secret',
  CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
  CLOUDFLARE_API_TOKEN: 'test-cf-token',
};

export const MOCK_INTELLIGENCE_SOURCES = [
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
