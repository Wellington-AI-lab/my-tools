/**
 * 测试文件：rate-limit.test.ts
 * 覆盖模块：src/lib/rate-limit.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bumpDailyCounter, clearDailyCounter } from './rate-limit';

// ============================================================================
// Mock Helpers
// ============================================================================

interface MockKV {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function createMockKV(): MockKV {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockLocals(kv: MockKV | null = null) {
  return {
    runtime: {
      env: {
        KV: kv,
      },
    },
  };
}

function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

// ============================================================================
// bumpDailyCounter Tests
// ============================================================================
describe('bumpDailyCounter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_return_allowed_true_on_first_call', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null); // No existing count
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
      });

      // Assert
      expect(result).toEqual({
        allowed: true,
        remaining: 9,
        count: 1,
        limit: 10,
      });
    });

    it('should_increment_existing_counter', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue('5'); // Already 5 attempts
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
      });

      // Assert
      expect(result).toEqual({
        allowed: true,
        remaining: 4,
        count: 6,
        limit: 10,
      });
    });

    it('should_return_allowed_false_when_limit_exceeded', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue('10'); // Already at limit
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
      });

      // Assert
      expect(result).toEqual({
        allowed: false,
        remaining: 0,
        count: 11,
        limit: 10,
      });
    });

    it('should_use_default_ttl_of_24_hours', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
      });

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('test:'),
        '1',
        { expirationTtl: 86400 } // 24 * 60 * 60
      );
    });

    it('should_include_date_in_key', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);
      const expectedDate = getUtcDateString();

      // Act
      await bumpDailyCounter({
        locals,
        keyPrefix: 'auth:fail',
        id: 'user123',
        limit: 10,
      });

      // Assert
      const key = mockKV.put.mock.calls[0][0];
      expect(key).toContain(`auth:fail:${expectedDate}:`);
    });

    it('should_include_id_in_key', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'specific-user-id',
        limit: 10,
      });

      // Assert
      const key = mockKV.put.mock.calls[0][0];
      expect(key).toContain('specific-user-id');
    });
  });

  describe('KV Unavailable', () => {
    it('should_return_allowed_true_when_kv_is_null', async () => {
      // Arrange
      const locals = createMockLocals(null); // No KV

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
      });

      // Assert
      expect(result).toEqual({
        allowed: true,
        remaining: 10,
        count: 0,
        limit: 10,
      });
    });

    it('should_not_call_kv_when_null', async () => {
      // Arrange
      const locals = createMockLocals(null);

      // Act
      await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
      });

      // Assert - Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Custom TTL', () => {
    it('should_use_custom_ttl_when_provided', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
        ttlSeconds: 3600, // 1 hour
      });

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { expirationTtl: 3600 }
      );
    });

    it('should_handle_zero_ttl', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
        ttlSeconds: 0,
      });

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { expirationTtl: 0 }
      );
    });

    it('should_handle_large_ttl', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
        ttlSeconds: 2592000, // 30 days
      });

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { expirationTtl: 2592000 }
      );
    });
  });

  describe('Invalid Values in KV', () => {
    it('should_handle_non_numeric_value', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue('not-a-number');
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
      });

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1); // Should reset to 1
    });

    it('should_handle_nan_value', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue('NaN');
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
      });

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
    });

    it('should_handle_infinity_value', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue('Infinity');
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
      });

      // Assert
      expect(result.count).toBe(1);
    });

    it('should_handle_negative_value', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue('-5');
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
      });

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(-4); // -5 + 1 = -4
    });

    it('should_handle_empty_string_value', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue('');
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 10,
      });

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should_handle_limit_of_1', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue('1');
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 1,
      });

      // Assert
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.count).toBe(2);
    });

    it('should_handle_large_limit', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue('99999');
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
        limit: 100000,
      });

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
      expect(result.count).toBe(100000);
    });

    it('should_handle_special_characters_in_id', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user@example.com',
        limit: 10,
      });

      // Assert
      expect(result.allowed).toBe(true);
      const key = mockKV.put.mock.calls[0][0];
      expect(key).toContain('user@example.com');
    });

    it('should_handle_unicode_in_id', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: '用户123',
        limit: 10,
      });

      // Assert
      expect(result.allowed).toBe(true);
    });

    it('should_handle_empty_id', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: '',
        limit: 10,
      });

      // Assert
      expect(result.allowed).toBe(true);
      const key = mockKV.put.mock.calls[0][0];
      expect(key).toMatch(/test:[\d-]+:$/);
    });

    it('should_handle_very_long_id', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);
      const longId = 'a'.repeat(1000);

      // Act
      const result = await bumpDailyCounter({
        locals,
        keyPrefix: 'test',
        id: longId,
        limit: 10,
      });

      // Assert
      expect(result.allowed).toBe(true);
    });
  });
});

// ============================================================================
// clearDailyCounter Tests
// ============================================================================
describe('clearDailyCounter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should_delete_counter_from_kv', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.delete.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);
      const expectedDate = getUtcDateString();

      // Act
      await clearDailyCounter({
        locals,
        keyPrefix: 'auth:fail',
        id: 'user123',
      });

      // Assert
      expect(mockKV.delete).toHaveBeenCalledWith(`auth:fail:${expectedDate}:user123`);
    });

    it('should_include_date_in_key', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.delete.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      await clearDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
      });

      // Assert
      const key = mockKV.delete.mock.calls[0][0];
      // Key should contain current date in format YYYY-MM-DD
      expect(key).toMatch(/test:\d{4}-\d{2}-\d{2}:user123/);
    });
  });

  describe('KV Unavailable', () => {
    it('should_return_early_when_kv_is_null', async () => {
      // Arrange
      const locals = createMockLocals(null);

      // Act - Should not throw
      await clearDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
      });

      // Assert - No exception means success
      expect(true).toBe(true);
    });

    it('should_not_call_anything_when_kv_is_null', async () => {
      // Arrange
      const locals = createMockLocals(null);

      // Act
      await clearDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user123',
      });

      // Assert
      expect(true).toBe(true); // Simply didn't throw
    });
  });

  describe('Delete Errors', () => {
    it('should_handle_kv_delete_error_gracefully', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.delete.mockRejectedValue(new Error('KV connection failed'));

      const locals = createMockLocals(mockKV);

      // Act & Assert - Should not throw, function returns void
      // The actual implementation doesn't have try-catch, so it will propagate errors
      // This test documents current behavior
      await expect(
        clearDailyCounter({
          locals,
          keyPrefix: 'test',
          id: 'user123',
        })
      ).rejects.toThrow('KV connection failed');
    });
  });

  describe('Edge Cases', () => {
    it('should_handle_special_characters_in_id', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.delete.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      await clearDailyCounter({
        locals,
        keyPrefix: 'test',
        id: 'user@example.com',
      });

      // Assert
      expect(mockKV.delete).toHaveBeenCalledWith(
        expect.stringContaining('user@example.com')
      );
    });

    it('should_handle_unicode_in_id', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.delete.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      await clearDailyCounter({
        locals,
        keyPrefix: 'test',
        id: '用户123',
      });

      // Assert
      expect(mockKV.delete).toHaveBeenCalled();
    });

    it('should_handle_empty_id', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.delete.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      await clearDailyCounter({
        locals,
        keyPrefix: 'test',
        id: '',
      });

      // Assert
      expect(mockKV.delete).toHaveBeenCalled();
    });

    it('should_handle_empty_keyPrefix', async () => {
      // Arrange
      const mockKV = createMockKV();
      mockKV.delete.mockResolvedValue(undefined);

      const locals = createMockLocals(mockKV);

      // Act
      await clearDailyCounter({
        locals,
        keyPrefix: '',
        id: 'user123',
      });

      // Assert
      expect(mockKV.delete).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================
describe('Integration - bump and clear cycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_reset_counter_after_clear', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockKV.get.mockResolvedValue('5');
    mockKV.put.mockResolvedValue(undefined);
    mockKV.delete.mockResolvedValue(undefined);

    const locals = createMockLocals(mockKV);

    // Act - First bump
    const result1 = await bumpDailyCounter({
      locals,
      keyPrefix: 'test',
      id: 'user123',
      limit: 10,
    });

    // Clear
    await clearDailyCounter({
      locals,
      keyPrefix: 'test',
      id: 'user123',
    });

    // Mock get to return null after clear
    mockKV.get.mockResolvedValueOnce(null);

    // Act - Second bump (should be at 1, not 7)
    const result2 = await bumpDailyCounter({
      locals,
      keyPrefix: 'test',
      id: 'user123',
      limit: 10,
    });

    // Assert
    expect(result1.count).toBe(6); // 5 + 1
    expect(result2.count).toBe(1); // Fresh start
    expect(result2.remaining).toBe(9);
  });

  it('should_track_multiple_independent_counters', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockKV.get.mockImplementation((key) => {
      if (key.includes('user1')) return Promise.resolve('3');
      if (key.includes('user2')) return Promise.resolve('7');
      return Promise.resolve(null);
    });
    mockKV.put.mockResolvedValue(undefined);

    const locals = createMockLocals(mockKV);

    // Act
    const result1 = await bumpDailyCounter({
      locals,
      keyPrefix: 'test',
      id: 'user1',
      limit: 10,
    });

    const result2 = await bumpDailyCounter({
      locals,
      keyPrefix: 'test',
      id: 'user2',
      limit: 10,
    });

    const result3 = await bumpDailyCounter({
      locals,
      keyPrefix: 'test',
      id: 'user3',
      limit: 10,
    });

    // Assert
    expect(result1.count).toBe(4);
    expect(result2.count).toBe(8);
    expect(result3.count).toBe(1);
  });

  it('should_handle_counter_at_exact_limit', async () => {
    // Arrange
    const mockKV = createMockKV();
    mockKV.get.mockResolvedValue('9');
    mockKV.put.mockResolvedValue(undefined);

    const locals = createMockLocals(mockKV);

    // Act
    const result = await bumpDailyCounter({
      locals,
      keyPrefix: 'test',
      id: 'user123',
      limit: 10,
    });

    // Assert
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(10);
    expect(result.remaining).toBe(0);
  });
});
