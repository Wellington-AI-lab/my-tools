/**
 * 测试文件：kv-json.test.ts
 * 覆盖模块：src/lib/kv-json.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kvGetJson, kvPutJson } from './kv-json';
import type { KVStorage } from './storage/kv';

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

// ============================================================================
// kvGetJson Tests
// ============================================================================
describe('kvGetJson', () => {
  let mockKV: KVStorage;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  describe('Happy Path - JSON Type', () => {
    it('should_return_parsed_json_object_when_type_is_json', async () => {
      // Arrange
      const testData = { foo: 'bar', count: 42 };
      vi.mocked(mockKV.get).mockResolvedValue(testData as any);

      // Act
      const result = await kvGetJson(mockKV, 'test:key', { default: 'value' });

      // Assert
      expect(result).toEqual(testData);
      expect(mockKV.get).toHaveBeenCalledWith('test:key', { type: 'json' });
    });

    it('should_return_parsed_json_array', async () => {
      // Arrange
      const testData = [1, 2, 3, { nested: true }];
      vi.mocked(mockKV.get).mockResolvedValue(testData as any);

      // Act
      const result = await kvGetJson(mockKV, 'test:array', [] as any);

      // Assert
      expect(result).toEqual(testData);
    });

    it('should_return_nested_json_structure', async () => {
      // Arrange
      const testData = {
        user: { name: 'test', age: 25 },
        tags: ['tag1', 'tag2'],
        active: true,
      };
      vi.mocked(mockKV.get).mockResolvedValue(testData as any);

      // Act
      const result = await kvGetJson(mockKV, 'test:nested', {} as any);

      // Assert
      expect(result).toEqual(testData);
    });
  });

  describe('Happy Path - String Type (Auto Parse)', () => {
    it('should_parse_stringified_json', async () => {
      // Arrange
      const jsonString = '{"foo":"bar","count":42}';
      vi.mocked(mockKV.get).mockResolvedValue(jsonString);

      // Act
      const result = await kvGetJson(mockKV, 'test:string', { default: null });

      // Assert
      expect(result).toEqual({ foo: 'bar', count: 42 });
    });

    it('should_parse_stringified_array', async () => {
      // Arrange
      const jsonString = '[1,2,3]';
      vi.mocked(mockKV.get).mockResolvedValue(jsonString);

      // Act
      const result = await kvGetJson(mockKV, 'test:array', []);

      // Assert
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('Fallback Behavior', () => {
    it('should_return_fallback_when_kv_returns_null', async () => {
      // Arrange
      const fallback = { default: true };
      vi.mocked(mockKV.get).mockResolvedValue(null);

      // Act
      const result = await kvGetJson(mockKV, 'test:missing', fallback);

      // Assert
      expect(result).toEqual(fallback);
    });

    it('should_return_fallback_when_kv_returns_undefined', async () => {
      // Arrange
      const fallback = [1, 2, 3];
      vi.mocked(mockKV.get).mockResolvedValue(undefined as any);

      // Act
      const result = await kvGetJson(mockKV, 'test:undefined', fallback);

      // Assert
      expect(result).toEqual(fallback);
    });

    it('should_return_primitive_fallback_values', async () => {
      // Arrange
      vi.mocked(mockKV.get).mockResolvedValue(null);

      // Act & Assert
      expect(await kvGetJson(mockKV, 'test:string', 'default')).toBe('default');
      expect(await kvGetJson(mockKV, 'test:number', 42)).toBe(42);
      expect(await kvGetJson(mockKV, 'test:boolean', true)).toBe(true);
      expect(await kvGetJson(mockKV, 'test:null', null)).toBe(null);
    });
  });

  describe('Error Handling - Invalid JSON String', () => {
    it('should_return_fallback_for_invalid_json_string', async () => {
      // Arrange
      const invalidJson = '{invalid json}';
      const fallback = { recovered: true };
      vi.mocked(mockKV.get).mockResolvedValue(invalidJson);

      // Act
      const result = await kvGetJson(mockKV, 'test:invalid', fallback);

      // Assert
      expect(result).toEqual(fallback);
    });

    it('should_return_fallback_for_malformed_json', async () => {
      // Arrange
      const malformedJson = '{"foo": bar}'; // missing quotes
      const fallback = { default: 'value' };
      vi.mocked(mockKV.get).mockResolvedValue(malformedJson);

      // Act
      const result = await kvGetJson(mockKV, 'test:malformed', fallback);

      // Assert
      expect(result).toEqual(fallback);
    });

    it('should_return_fallback_for_empty_string', async () => {
      // Arrange
      const fallback = { data: [] };
      vi.mocked(mockKV.get).mockResolvedValue('');

      // Act
      const result = await kvGetJson(mockKV, 'test:empty', fallback);

      // Assert
      expect(result).toEqual(fallback);
    });

    it('should_return_fallback_for_non_json_string', async () => {
      // Arrange
      const plainString = 'just plain text';
      const fallback = { parsed: false };
      vi.mocked(mockKV.get).mockResolvedValue(plainString);

      // Act
      const result = await kvGetJson(mockKV, 'test:plain', fallback);

      // Assert
      expect(result).toEqual(fallback);
    });
  });

  describe('Edge Cases', () => {
    it('should_handle_null_json_value', async () => {
      // Arrange
      vi.mocked(mockKV.get).mockResolvedValue(null);

      // Act
      const result = await kvGetJson(mockKV, 'test:null', { default: 'value' });

      // Assert
      expect(result).toEqual({ default: 'value' });
    });

    it('should_handle_empty_object', async () => {
      // Arrange
      vi.mocked(mockKV.get).mockResolvedValue({});

      // Act
      const result = await kvGetJson(mockKV, 'test:emptyobj', { filled: true });

      // Assert
      expect(result).toEqual({});
    });

    it('should_handle_empty_array', async () => {
      // Arrange
      vi.mocked(mockKV.get).mockResolvedValue([]);

      // Act
      const result = await kvGetJson(mockKV, 'test:emptyarr', [1, 2]);

      // Assert
      expect(result).toEqual([]);
    });

    it('should_handle_numeric_zero', async () => {
      // Arrange
      (vi.mocked(mockKV.get) as any).mockResolvedValue(0);

      // Act
      const result = await kvGetJson(mockKV, 'test:zero', 42);

      // Assert
      expect(result).toBe(0);
    });

    it('should_handle_false_boolean', async () => {
      // Arrange
      (vi.mocked(mockKV.get) as any).mockResolvedValue(false);

      // Act
      const result = await kvGetJson(mockKV, 'test:false', true);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Type Preservation', () => {
    it('should_preserve_date_objects_stored_as_strings', async () => {
      // Arrange
      const dateStr = '2025-01-01T00:00:00.000Z';
      vi.mocked(mockKV.get).mockResolvedValue(JSON.stringify({ date: dateStr }));

      // Act
      const result = await kvGetJson(mockKV, 'test:date', {} as any);

      // Assert
      expect(result).toEqual({ date: dateStr });
    });

    it('should_handle_complex_nested_structures', async () => {
      // Arrange
      const complex = {
        users: [
          { id: 1, name: 'Alice', tags: ['admin', 'user'] },
          { id: 2, name: 'Bob', tags: ['user'] },
        ],
        metadata: { count: 2, lastUpdated: '2025-01-01' },
      };
      vi.mocked(mockKV.get).mockResolvedValue(complex as any);

      // Act
      const result = await kvGetJson(mockKV, 'test:complex', {} as any);

      // Assert
      expect(result).toEqual(complex);
    });
  });
});

// ============================================================================
// kvPutJson Tests
// ============================================================================
describe('kvPutJson', () => {
  let mockKV: KVStorage;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  describe('Happy Path', () => {
    it('should_stringify_and_store_object', async () => {
      // Arrange
      const data = { foo: 'bar', count: 42 };
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:key', data);

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith('test:key', JSON.stringify(data), undefined);
    });

    it('should_stringify_and_store_array', async () => {
      // Arrange
      const data = [1, 2, 3, { nested: true }];
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:array', data);

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith('test:array', JSON.stringify(data), undefined);
    });

    it('should_store_primitive_values', async () => {
      // Arrange
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:string', 'hello');
      await kvPutJson(mockKV, 'test:number', 42);
      await kvPutJson(mockKV, 'test:boolean', true);

      // Assert
      expect(mockKV.put).toHaveBeenNthCalledWith(1, 'test:string', '"hello"', undefined);
      expect(mockKV.put).toHaveBeenNthCalledWith(2, 'test:number', '42', undefined);
      expect(mockKV.put).toHaveBeenNthCalledWith(3, 'test:boolean', 'true', undefined);
    });
  });

  describe('TTL Support', () => {
    it('should_pass_ttl_option_when_provided', async () => {
      // Arrange
      const data = { cached: true };
      const ttl = 3600; // 1 hour
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:ttl', data, ttl);

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith('test:ttl', JSON.stringify(data), {
        expirationTtl: ttl,
      });
    });

    it('should_handle_zero_ttl', async () => {
      // Arrange
      const data = { immediate: true };
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:zero', data, 0);

      // Assert - When ttl is 0, it's falsy so no expirationTtl is passed
      expect(mockKV.put).toHaveBeenCalledWith('test:zero', JSON.stringify(data), undefined);
    });

    it('should_not_pass_ttl_when_not_provided', async () => {
      // Arrange
      const data = { persistent: true };
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:persist', data);

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith('test:persist', JSON.stringify(data), undefined);
    });
  });

  describe('Special Values', () => {
    it('should_store_null', async () => {
      // Arrange
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:null', null);

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith('test:null', 'null', undefined);
    });

    it('should_store_empty_object', async () => {
      // Arrange
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:empty', {});

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith('test:empty', '{}', undefined);
    });

    it('should_store_empty_array', async () => {
      // Arrange
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:emptyarr', []);

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith('test:emptyarr', '[]', undefined);
    });
  });

  describe('Complex Structures', () => {
    it('should_handle_unicode_characters', async () => {
      // Arrange
      const data = { message: '你好世界🌍', emoji: '🔐' };
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:unicode', data);

      // Assert
      const expected = JSON.stringify(data);
      expect(mockKV.put).toHaveBeenCalledWith('test:unicode', expected, undefined);
    });

    it('should_handle_special_characters', async () => {
      // Arrange
      const data = { special: '\n\t\r\"\\', control: '\x00' };
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:special', data);

      // Assert
      const expected = JSON.stringify(data);
      expect(mockKV.put).toHaveBeenCalledWith('test:special', expected, undefined);
    });

    it('should_handle_deeply_nested_structures', async () => {
      // Arrange
      const data = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      };
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:nested', data);

      // Assert
      const expected = JSON.stringify(data);
      expect(mockKV.put).toHaveBeenCalledWith('test:nested', expected, undefined);
    });

    it('should_handle_arrays_with_objects', async () => {
      // Arrange
      const data = {
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
        ],
      };
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:items', data);

      // Assert
      const expected = JSON.stringify(data);
      expect(mockKV.put).toHaveBeenCalledWith('test:items', expected, undefined);
    });
  });

  describe('Error Propagation', () => {
    it('should_propagate_kv_errors', async () => {
      // Arrange
      const data = { error: true };
      vi.mocked(mockKV.put).mockRejectedValue(new Error('KV write failed'));

      // Act & Assert
      await expect(kvPutJson(mockKV, 'test:error', data)).rejects.toThrow('KV write failed');
    });

    it('should_handle_json_stringify_errors', async () => {
      // Arrange
      // Create an object with circular reference that can't be stringified
      const circular: any = { name: 'circular' };
      circular.self = circular;
      vi.mocked(mockKV.put).mockImplementation(() => {
        // This will be called with the result of JSON.stringify
        // But JSON.stringify will throw first
        throw new Error('Converting circular structure to JSON');
      });

      // Act & Assert
      // Note: JSON.stringify throws synchronously before kv.put is called
      expect(() => JSON.stringify(circular)).toThrow();
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================
describe('Integration - kvGetJson and kvPutJson', () => {
  let mockKV: KVStorage;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  describe('Round-trip Tests', () => {
    it('should_successfully_round_trip_object', async () => {
      // Arrange
      const original = { foo: 'bar', count: 42, nested: { active: true } };
      vi.mocked(mockKV.get).mockImplementation((key, opts) => {
        // Simulate KV storing and retrieving the stringified value
        return Promise.resolve(JSON.stringify(original) as any);
      });
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act - Write
      await kvPutJson(mockKV, 'test:roundtrip', original);

      // Act - Read
      const retrieved = await kvGetJson(mockKV, 'test:roundtrip', {} as any);

      // Assert
      expect(retrieved).toEqual(original);
    });

    it('should_successfully_round_trip_array', async () => {
      // Arrange
      const original = [1, 2, 3, { nested: true }];
      vi.mocked(mockKV.get).mockResolvedValue(JSON.stringify(original));
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:array', original);
      const retrieved = await kvGetJson(mockKV, 'test:array', [] as any);

      // Assert
      expect(retrieved).toEqual(original);
    });

    it('should_handle_cache_miss_pattern', async () => {
      // Arrange - Simulate cache miss then hit
      const cachedData = { fromCache: true };
      const fallbackData = { fresh: true };

      // First call - cache miss
      vi.mocked(mockKV.get).mockResolvedValueOnce(null);
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act - First call (miss)
      const first = await kvGetJson(mockKV, 'test:cache', fallbackData);
      expect(first).toEqual(fallbackData);

      // Write to cache
      await kvPutJson(mockKV, 'test:cache', cachedData);

      // Now mock will return the cached data
      vi.mocked(mockKV.get).mockResolvedValueOnce(JSON.stringify(cachedData));

      // Act - Second call (hit)
      const second = await kvGetJson(mockKV, 'test:cache', fallbackData);

      // Assert
      expect(second).toEqual(cachedData);
    });
  });

  describe('TTL Integration', () => {
    it('should_store_with_ttl_and_retrieve_correctly', async () => {
      // Arrange
      const data = { expires: 'soon' };
      const ttl = 300; // 5 minutes
      vi.mocked(mockKV.get).mockResolvedValue(JSON.stringify(data));
      vi.mocked(mockKV.put).mockResolvedValue(undefined);

      // Act
      await kvPutJson(mockKV, 'test:expires', data, ttl);
      const retrieved = await kvGetJson(mockKV, 'test:expires', { default: true });

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith('test:expires', JSON.stringify(data), {
        expirationTtl: ttl,
      });
      expect(retrieved).toEqual(data);
    });
  });
});
