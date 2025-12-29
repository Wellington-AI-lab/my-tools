/**
 * 测试文件：env.test.ts
 * 覆盖模块：src/lib/env.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEnv, getKV, getIntelligenceDB, requireIntelligenceDB, isProduction, requireKV } from './env';

// ============================================================================
// Mock Helpers
// ============================================================================

interface MockRuntime {
  env?: {
    KV?: KVNamespace;
    INTELLIGENCE_DB?: D1Database;
    NODE_ENV?: string;
    [key: string]: any;
  };
}

function createMockLocals(runtime?: MockRuntime | null): App.Locals {
  return {
    runtime: runtime ?? undefined,
  } as App.Locals;
}

function createMockKV(): KVNamespace {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  } as unknown as KVNamespace;
}

function createMockD1(): D1Database {
  return {
    prepare: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
}

// ============================================================================
// getEnv Tests
// ============================================================================
describe('getEnv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_return_env_when_runtime_is_available', () => {
      // Arrange
      const mockKV = createMockKV();
      const mockD1 = createMockD1();
      const locals = createMockLocals({
        env: {
          KV: mockKV,
          INTELLIGENCE_DB: mockD1,
          NODE_ENV: 'production',
        },
      });

      // Act
      const env = getEnv(locals);

      // Assert
      expect(env).toBeDefined();
      expect(env.KV).toBe(mockKV);
      expect(env.INTELLIGENCE_DB).toBe(mockD1);
      expect(env.NODE_ENV).toBe('production');
    });

    it('should_return_env_with_empty_bindings', () => {
      // Arrange
      const locals = createMockLocals({
        env: {},
      });

      // Act
      const env = getEnv(locals);

      // Assert
      expect(env).toBeDefined();
      expect(env).toEqual({});
    });
  });

  describe('Error Cases', () => {
    it('should_throw_error_when_runtime_is_missing', () => {
      // Arrange
      const locals = createMockLocals(null);

      // Act & Assert
      expect(() => getEnv(locals)).toThrow(
        'Cloudflare runtime not available. Use `wrangler pages dev` for local development.'
      );
    });

    it('should_throw_error_when_runtime_is_undefined', () => {
      // Arrange
      const locals = {} as App.Locals;

      // Act & Assert
      expect(() => getEnv(locals)).toThrow(
        'Cloudflare runtime not available. Use `wrangler pages dev` for local development.'
      );
    });

    it('should_throw_error_when_runtime_env_is_null', () => {
      // Arrange
      const locals = createMockLocals({
        env: null as any,
      });

      // Act & Assert
      expect(() => getEnv(locals)).toThrow(
        'Cloudflare runtime not available. Use `wrangler pages dev` for local development.'
      );
    });

    it('should_throw_error_when_runtime_env_is_undefined', () => {
      // Arrange
      const locals = createMockLocals({
        env: undefined,
      });

      // Act & Assert
      expect(() => getEnv(locals)).toThrow(
        'Cloudflare runtime not available. Use `wrangler pages dev` for local development.'
      );
    });
  });
});

// ============================================================================
// getKV Tests
// ============================================================================
describe('getKV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_return_kv_when_bound', () => {
      // Arrange
      const mockKV = createMockKV();
      const locals = createMockLocals({
        env: { KV: mockKV },
      });

      // Act
      const kv = getKV(locals);

      // Assert
      expect(kv).toBe(mockKV);
    });
  });

  describe('KV Not Bound', () => {
    it('should_return_null_when_kv_is_not_bound', () => {
      // Arrange
      const locals = createMockLocals({
        env: {},
      });

      // Act
      const kv = getKV(locals);

      // Assert
      expect(kv).toBeNull();
    });

    it('should_return_null_when_kv_is_undefined', () => {
      // Arrange
      const locals = createMockLocals({
        env: { KV: undefined },
      });

      // Act
      const kv = getKV(locals);

      // Assert
      expect(kv).toBeNull();
    });

    it('should_return_null_when_kv_is_null', () => {
      // Arrange
      const locals = createMockLocals({
        env: { KV: null },
      });

      // Act
      const kv = getKV(locals);

      // Assert
      expect(kv).toBeNull();
    });
  });
});

// ============================================================================
// getIntelligenceDB Tests
// ============================================================================
describe('getIntelligenceDB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_return_d1_when_bound', () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals({
        env: { INTELLIGENCE_DB: mockD1 },
      });

      // Act
      const db = getIntelligenceDB(locals);

      // Assert
      expect(db).toBe(mockD1);
    });
  });

  describe('D1 Not Bound', () => {
    it('should_return_null_when_d1_is_not_bound', () => {
      // Arrange
      const locals = createMockLocals({
        env: {},
      });

      // Act
      const db = getIntelligenceDB(locals);

      // Assert
      expect(db).toBeNull();
    });

    it('should_return_null_when_d1_is_undefined', () => {
      // Arrange
      const locals = createMockLocals({
        env: { INTELLIGENCE_DB: undefined },
      });

      // Act
      const db = getIntelligenceDB(locals);

      // Assert
      expect(db).toBeNull();
    });

    it('should_return_null_when_d1_is_null', () => {
      // Arrange
      const locals = createMockLocals({
        env: { INTELLIGENCE_DB: null },
      });

      // Act
      const db = getIntelligenceDB(locals);

      // Assert
      expect(db).toBeNull();
    });
  });
});

// ============================================================================
// requireIntelligenceDB Tests
// ============================================================================
describe('requireIntelligenceDB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_return_d1_when_bound', () => {
      // Arrange
      const mockD1 = createMockD1();
      const locals = createMockLocals({
        env: { INTELLIGENCE_DB: mockD1 },
      });

      // Act
      const db = requireIntelligenceDB(locals);

      // Assert
      expect(db).toBe(mockD1);
    });
  });

  describe('Error Cases', () => {
    it('should_throw_error_when_d1_is_not_bound', () => {
      // Arrange
      const locals = createMockLocals({
        env: {},
      });

      // Act & Assert
      expect(() => requireIntelligenceDB(locals)).toThrow(
        'Intelligence D1 binding is missing. Please bind D1 as `INTELLIGENCE_DB` in Cloudflare Pages (Settings → Functions → D1 database bindings).'
      );
    });

    it('should_throw_error_when_d1_is_null', () => {
      // Arrange
      const locals = createMockLocals({
        env: { INTELLIGENCE_DB: null },
      });

      // Act & Assert
      expect(() => requireIntelligenceDB(locals)).toThrow(
        'Intelligence D1 binding is missing. Please bind D1 as `INTELLIGENCE_DB` in Cloudflare Pages (Settings → Functions → D1 database bindings).'
      );
    });

    it('should_throw_error_when_d1_is_undefined', () => {
      // Arrange
      const locals = createMockLocals({
        env: { INTELLIGENCE_DB: undefined },
      });

      // Act & Assert
      expect(() => requireIntelligenceDB(locals)).toThrow(
        'Intelligence D1 binding is missing. Please bind D1 as `INTELLIGENCE_DB` in Cloudflare Pages (Settings → Functions → D1 database bindings).'
      );
    });
  });
});

// ============================================================================
// isProduction Tests
// ============================================================================
describe('isProduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_return_true_when_node_env_is_production', () => {
      // Arrange
      const locals = createMockLocals({
        env: { NODE_ENV: 'production' },
      });

      // Act
      const result = isProduction(locals);

      // Assert
      expect(result).toBe(true);
    });

    it('should_return_false_when_node_env_is_development', () => {
      // Arrange
      const locals = createMockLocals({
        env: { NODE_ENV: 'development' },
      });

      // Act
      const result = isProduction(locals);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_when_node_env_is_test', () => {
      // Arrange
      const locals = createMockLocals({
        env: { NODE_ENV: 'test' },
      });

      // Act
      const result = isProduction(locals);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should_return_false_when_node_env_is_undefined', () => {
      // Arrange
      const locals = createMockLocals({
        env: {},
      });

      // Act
      const result = isProduction(locals);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_when_node_env_is_null', () => {
      // Arrange
      const locals = createMockLocals({
        env: { NODE_ENV: null as any },
      });

      // Act
      const result = isProduction(locals);

      // Assert
      expect(result).toBe(false);
    });

    it('should_be_case_sensitive', () => {
      // Arrange
      const locals = createMockLocals({
        env: { NODE_ENV: 'Production' },
      });

      // Act
      const result = isProduction(locals);

      // Assert
      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// requireKV Tests
// ============================================================================
describe('requireKV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_return_kv_when_bound', () => {
      // Arrange
      const mockKV = createMockKV();
      const locals = createMockLocals({
        env: { KV: mockKV },
      });

      // Act
      const kv = requireKV(locals);

      // Assert
      expect(kv).toBe(mockKV);
    });
  });

  describe('Error Cases', () => {
    it('should_throw_error_when_kv_is_not_bound', () => {
      // Arrange
      const locals = createMockLocals({
        env: {},
      });

      // Act & Assert
      expect(() => requireKV(locals)).toThrow(
        'KV binding is missing. Please bind KV as `KV` in Cloudflare Pages (Settings → Functions → KV namespace bindings).'
      );
    });

    it('should_throw_error_when_kv_is_null', () => {
      // Arrange
      const locals = createMockLocals({
        env: { KV: null },
      });

      // Act & Assert
      expect(() => requireKV(locals)).toThrow(
        'KV binding is missing. Please bind KV as `KV` in Cloudflare Pages (Settings → Functions → KV namespace bindings).'
      );
    });

    it('should_throw_error_when_kv_is_undefined', () => {
      // Arrange
      const locals = createMockLocals({
        env: { KV: undefined },
      });

      // Act & Assert
      expect(() => requireKV(locals)).toThrow(
        'KV binding is missing. Please bind KV as `KV` in Cloudflare Pages (Settings → Functions → KV namespace bindings).'
      );
    });
  });
});
