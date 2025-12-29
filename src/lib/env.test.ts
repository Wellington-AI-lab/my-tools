/**
 * 测试文件：env.test.ts
 * 覆盖模块：src/lib/env.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEnv, getKV, getIntelligenceDB, requireIntelligenceDB, isProduction, requireKV } from './env';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockLocals(runtime?: any): App.Locals {
  return {
    runtime: runtime ?? undefined,
  } as App.Locals;
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
// getEnv Tests
// ============================================================================
describe('getEnv', () => {
  afterEach(() => {
    resetEnv();
  });

  describe('Happy Path', () => {
    it('should_return_env_with_all_variables', () => {
      // Arrange
      mockEnv({
        SESSION_SECRET: 'test-secret',
        POSTGRES_URL: 'postgres://test',
        KV_URL: 'https://kv.test.com',
      });

      // Act
      const env = getEnv({} as App.Locals);

      // Assert
      expect(env).toBeDefined();
      expect(env.SESSION_SECRET).toBe('test-secret');
      expect(env.POSTGRES_URL).toBe('postgres://test');
      expect(env.KV_URL).toBe('https://kv.test.com');
    });

    it('should_return_empty_env_when_no_vars_set', () => {
      // Arrange
      mockEnv({});

      // Act
      const env = getEnv({} as App.Locals);

      // Assert
      expect(env).toBeDefined();
      // getEnv always returns all known env keys, even if undefined
      expect(Object.keys(env).length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// getKV Tests
// ============================================================================
describe('getKV', () => {
  afterEach(() => {
    resetEnv();
  });

  describe('Happy Path', () => {
    it('should_return_kv_when_vercel_kv_env_vars_are_set', () => {
      // Arrange
      mockEnv({
        KV_URL: 'https://kv.test.com',
        KV_REST_API_READ_WRITE_TOKEN: 'test-token',
      });

      // Act
      const kv = getKV({} as App.Locals);

      // Assert
      expect(kv).toBeDefined();
      expect(kv).not.toBeNull();
    });

    it('should_return_kv_when_redis_url_is_set', () => {
      // Arrange
      mockEnv({
        REDIS_URL: 'redis://localhost:6379',
      });

      // Act
      const kv = getKV({} as App.Locals);

      // Assert
      expect(kv).toBeDefined();
      expect(kv).not.toBeNull();
    });
  });

  describe('KV Not Configured', () => {
    it('should_return_null_when_no_kv_env_vars_are_set', () => {
      // Arrange
      mockEnv({});

      // Act
      const kv = getKV({} as App.Locals);

      // Assert
      expect(kv).toBeNull();
    });
  });
});

// ============================================================================
// getIntelligenceDB Tests
// ============================================================================
describe('getIntelligenceDB', () => {
  afterEach(() => {
    resetEnv();
  });

  describe('Happy Path', () => {
    it('should_return_db_when_postgres_url_is_set', () => {
      // Arrange
      mockEnv({
        POSTGRES_URL: 'postgres://test:user@localhost/test',
      });

      // Act
      const db = getIntelligenceDB({} as App.Locals);

      // Assert
      expect(db).toBeDefined();
      expect(db).not.toBeNull();
    });

    it('should_return_db_when_database_url_is_set', () => {
      // Arrange
      mockEnv({
        DATABASE_URL: 'postgres://test:user@localhost/test',
      });

      // Act
      const db = getIntelligenceDB({} as App.Locals);

      // Assert
      expect(db).toBeDefined();
      expect(db).not.toBeNull();
    });
  });

  describe('DB Not Configured', () => {
    it('should_return_null_when_no_db_env_vars_are_set', () => {
      // Arrange
      mockEnv({});

      // Act
      const db = getIntelligenceDB({} as App.Locals);

      // Assert
      expect(db).toBeNull();
    });
  });
});

// ============================================================================
// requireIntelligenceDB Tests
// ============================================================================
describe('requireIntelligenceDB', () => {
  afterEach(() => {
    resetEnv();
  });

  describe('Happy Path', () => {
    it('should_return_db_when_postgres_url_is_set', () => {
      // Arrange
      mockEnv({
        POSTGRES_URL: 'postgres://test:user@localhost/test',
      });

      // Act
      const db = requireIntelligenceDB({} as App.Locals);

      // Assert
      expect(db).toBeDefined();
    });
  });

  describe('Error Cases', () => {
    it('should_throw_error_when_no_db_env_vars_are_set', () => {
      // Arrange
      mockEnv({});

      // Act & Assert
      expect(() => requireIntelligenceDB({} as App.Locals)).toThrow(
        'Database not configured. Please configure Vercel Postgres (POSTGRES_URL or DATABASE_URL).'
      );
    });
  });
});

// ============================================================================
// isProduction Tests
// ============================================================================
describe('isProduction', () => {
  afterEach(() => {
    resetEnv();
  });

  describe('Happy Path', () => {
    it('should_return_true_when_node_env_is_production', () => {
      // Arrange
      mockEnv({ NODE_ENV: 'production' });

      // Act
      const result = isProduction({} as App.Locals);

      // Assert
      expect(result).toBe(true);
    });

    it('should_return_false_when_node_env_is_development', () => {
      // Arrange
      mockEnv({ NODE_ENV: 'development' });

      // Act
      const result = isProduction({} as App.Locals);

      // Assert
      expect(result).toBe(false);
    });

    it('should_return_false_when_node_env_is_test', () => {
      // Arrange
      mockEnv({ NODE_ENV: 'test' });

      // Act
      const result = isProduction({} as App.Locals);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should_return_false_when_node_env_is_undefined', () => {
      // Arrange
      mockEnv({});

      // Act
      const result = isProduction({} as App.Locals);

      // Assert
      expect(result).toBe(false);
    });

    it('should_be_case_sensitive', () => {
      // Arrange
      mockEnv({ NODE_ENV: 'Production' });

      // Act
      const result = isProduction({} as App.Locals);

      // Assert
      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// requireKV Tests
// ============================================================================
describe('requireKV', () => {
  afterEach(() => {
    resetEnv();
  });

  describe('Happy Path', () => {
    it('should_return_kv_when_vercel_kv_env_vars_are_set', () => {
      // Arrange
      mockEnv({
        KV_URL: 'https://kv.test.com',
        KV_REST_API_READ_WRITE_TOKEN: 'test-token',
      });

      // Act
      const kv = requireKV({} as App.Locals);

      // Assert
      expect(kv).toBeDefined();
    });

    it('should_return_kv_when_redis_url_is_set', () => {
      // Arrange
      mockEnv({
        REDIS_URL: 'redis://localhost:6379',
      });

      // Act
      const kv = requireKV({} as App.Locals);

      // Assert
      expect(kv).toBeDefined();
    });
  });

  describe('Error Cases', () => {
    it('should_throw_error_when_no_kv_env_vars_are_set', () => {
      // Arrange
      mockEnv({});

      // Act & Assert
      expect(() => requireKV({} as App.Locals)).toThrow(
        'KV storage not configured. Please configure Vercel KV (KV_URL/KV_REST_API_READ_WRITE_TOKEN or REDIS_URL).'
      );
    });
  });
});
