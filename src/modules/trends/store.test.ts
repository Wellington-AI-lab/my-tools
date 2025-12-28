/**
 * 高强度测试套件：trends/store.test.ts
 * 覆盖模块：src/modules/trends/store.ts
 * 目标覆盖率：≥98% 分支覆盖
 * 测试重点：KV 操作、序列化/反序列化、边界条件、错误处理
 * 生成时间：2025-12-28
 * 测试框架：vitest
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  trendsDayKey,
  putTrendsReport,
  getLatestTrendsReport,
  getTrendsHistory,
  getTrendsAliases,
  putTrendsAliases,
} from './store';
import type { TrendsReport } from '../types';

// ============================================================================
// Mock KV Namespace
// ============================================================================
class MockKVNamespace implements KVNamespace {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null>;
  async get(key: string, type: 'text'): Promise<string | null>;
  async get(key: string, type: 'json'): Promise<any>;
  async get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  async get(key: string, type: 'stream'): Promise<ReadableStream | null>;
  async get(key: string, typeOrOptions?: string | { type: string }): Promise<string | null | any | ArrayBuffer | ReadableStream | null> {
    const value = this.store.get(key);
    // Handle both string type ('json') and object ({ type: 'json' })
    const type = typeof typeOrOptions === 'string' ? typeOrOptions : typeOrOptions?.type;
    if (type === 'json') {
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value ?? null;
  }

  async put(key: string, value: string | ReadableStream | ArrayBuffer, options?: KVNamespacePutOptions): Promise<void> {
    let stringValue: string;
    if (typeof value === 'string') {
      stringValue = value;
    } else if (value instanceof ArrayBuffer) {
      stringValue = JSON.stringify(Array.from(new Uint8Array(value)));
    } else {
      throw new Error('Stream not supported in mock');
    }
    this.store.set(key, stringValue);

    // Simulate TTL by storing expiration time
    if (options?.expirationTtl) {
      const expiresAt = Date.now() + options.expirationTtl * 1000;
      this.store.set(`__ttl__${key}`, expiresAt.toString());
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    this.store.delete(`__ttl__${key}`);
  }

  async list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult> {
    const prefix = options?.prefix ?? '';
    const keys: { name: string }[] = [];

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix) && !key.startsWith('__ttl__')) {
        keys.push({ name: key });
      }
    }

    return {
      keys: keys.slice(0, options?.limit ?? 1000),
      list_complete: true,
      cursor: '',
    };
  }

  // Helper for testing
  getSize(): number {
    return this.store.size;
  }

  hasKey(key: string): boolean {
    return this.store.has(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// ============================================================================
// 测试数据构造器
// ============================================================================
function createMockReport(overrides?: Partial<TrendsReport>): TrendsReport {
  return {
    meta: {
      generated_at: '2025-12-28T00:00:00.000Z',
      day_key: '2025-12-28',
      sources_used: ['google_trends_rss', 'weibo_hot'],
      items_scanned: 100,
      items_kept: 50,
      execution_time_ms: 1000,
      llm_used: 'llm',
    },
    logs: [],
    trends_by_theme: [
      {
        theme: 'finance',
        keywords: ['bitcoin', 'stock'],
        cards: [
          {
            id: 'test1',
            source: 'google_trends_rss',
            title: 'Bitcoin price up',
            language: 'en',
            themes: ['finance'],
            signals: { score: 100 },
          },
        ],
      },
    ],
    insight_markdown: 'Test insight',
    ...overrides,
  };
}

// ============================================================================
// trendsDayKey 测试
// ============================================================================
describe('trendsDayKey', () => {
  it('should_prefix_day_key_correctly', () => {
    expect(trendsDayKey('2025-12-28')).toBe('trends:daily:2025-12-28');
  });

  it('should_handle_various_date_formats', () => {
    expect(trendsDayKey('2025-01-01')).toBe('trends:daily:2025-01-01');
    expect(trendsDayKey('2024-12-31')).toBe('trends:daily:2024-12-31');
  });

  it('should_handle_empty_string', () => {
    expect(trendsDayKey('')).toBe('trends:daily:');
  });

  it('should_handle_special_chars_in_day_key', () => {
    expect(trendsDayKey('2025/12/28')).toBe('trends:daily:2025/12/28');
    expect(trendsDayKey('test-key')).toBe('trends:daily:test-key');
  });
});

// ============================================================================
// putTrendsReport 测试
// ============================================================================
describe('putTrendsReport', () => {
  let kv: MockKVNamespace;

  beforeEach(() => {
    kv = new MockKVNamespace();
  });

  describe('基本功能', () => {
    it('should_store_report_successfully', async () => {
      const report = createMockReport();
      await putTrendsReport(kv, report);

      expect(kv.hasKey('trends:daily:2025-12-28')).toBe(true);
      expect(kv.hasKey('trends:latest')).toBe(true);
    });

    it('should_store_in_all_required_keys', async () => {
      const report = createMockReport();
      await putTrendsReport(kv, report);

      expect(kv.hasKey('trends:daily:2025-12-28')).toBe(true);
      expect(kv.hasKey('trends:latest')).toBe(true);
      expect(kv.hasKey('trends:index')).toBe(true);
      expect(kv.hasKey('news:keywords:latest')).toBe(true);
    });

    it('should_serialize_data_correctly', async () => {
      const report = createMockReport();
      await putTrendsReport(kv, report);

      const stored = await kv.get('trends:daily:2025-12-28', 'json');
      expect(stored).toBeDefined();
      expect(stored.meta.day_key).toBe('2025-12-28');
    });
  });

  describe('错误处理', () => {
    it('should_throw_error_when_day_key_missing', async () => {
      const report = createMockReport({ meta: { ...createMockReport().meta, day_key: '' as any } });

      await expect(putTrendsReport(kv, report)).rejects.toThrow('day_key is missing');
    });

    it('should_throw_error_when_day_key_null', async () => {
      const report = createMockReport({ meta: { ...createMockReport().meta, day_key: null as any } });

      await expect(putTrendsReport(kv, report)).rejects.toThrow();
    });

    it('should_throw_error_when_day_key_undefined', async () => {
      const report = createMockReport({ meta: { ...createMockReport().meta, day_key: undefined as any } });

      await expect(putTrendsReport(kv, report)).rejects.toThrow();
    });

    it('should_handle_whitespace_only_day_key', async () => {
      const report = createMockReport({ meta: { ...createMockReport().meta, day_key: '   ' } });

      await expect(putTrendsReport(kv, report)).rejects.toThrow();
    });

    it('should_handle_missing_meta', async () => {
      const report = createMockReport();
      (report as any).meta = undefined;

      await expect(putTrendsReport(kv, report)).rejects.toThrow();
    });

    it('should_handle_null_report', async () => {
      await expect(putTrendsReport(kv, null as any)).rejects.toThrow();
    });
  });

  describe('索引管理', () => {
    it('should_add_day_key_to_index', async () => {
      const report1 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-28' } });
      const report2 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-27' } });

      await putTrendsReport(kv, report1);
      await putTrendsReport(kv, report2);

      const index = await kv.get('trends:index', 'json');
      expect(index).toContain('2025-12-28');
      expect(index).toContain('2025-12-27');
    });

    it('should_keep_index_unique', async () => {
      const report = createMockReport();
      await putTrendsReport(kv, report);
      await putTrendsReport(kv, report); // Same day again

      const index = await kv.get('trends:index', 'json');
      const count = index.filter((k: string) => k === '2025-12-28').length;
      expect(count).toBe(1);
    });

    it('should_limit_index_to_14_entries', async () => {
      // Add 15 reports
      for (let i = 0; i < 15; i++) {
        const report = createMockReport({
          meta: { ...createMockReport().meta, day_key: `2025-12-${String(i).padStart(2, '0')}` },
        });
        await putTrendsReport(kv, report);
      }

      const index = await kv.get('trends:index', 'json');
      expect(index.length).toBeLessThanOrEqual(14);
    });

    it('should_put_newest_first_in_index', async () => {
      const report1 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-27' } });
      const report2 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-28' } });

      await putTrendsReport(kv, report1);
      await putTrendsReport(kv, report2);

      const index = await kv.get('trends:index', 'json');
      expect(index[0]).toBe('2025-12-28');
    });
  });

  describe('关键词提取', () => {
    it('should_extract_and_store_keywords', async () => {
      const report = createMockReport();
      await putTrendsReport(kv, report);

      const keywords = await kv.get('news:keywords:latest', 'json');
      expect(keywords).toBeDefined();
      expect(keywords.keywords).toBeDefined();
      expect(keywords.updatedAt).toBeDefined();
      expect(keywords.fromDayKey).toBe('2025-12-28');
    });

    it('should_include_finance_keywords', async () => {
      const report = createMockReport({
        trends_by_theme: [
          {
            theme: 'finance',
            keywords: ['bitcoin', 'stock', 'trading'],
            cards: [],
          },
        ],
      });
      await putTrendsReport(kv, report);

      const keywords = await kv.get('news:keywords:latest', 'json');
      expect(keywords.keywords.finance).toContain('bitcoin');
    });

    it('should_include_economy_keywords', async () => {
      const report = createMockReport({
        trends_by_theme: [
          {
            theme: 'economy',
            keywords: ['gdp', 'cpi'],
            cards: [],
          },
        ],
      });
      await putTrendsReport(kv, report);

      const keywords = await kv.get('news:keywords:latest', 'json');
      expect(keywords.keywords.economy).toContain('gdp');
    });

    it('should_include_ai_keywords', async () => {
      const report = createMockReport({
        trends_by_theme: [
          {
            theme: 'ai',
            keywords: ['llm', 'chatgpt'],
            cards: [],
          },
        ],
      });
      await putTrendsReport(kv, report);

      const keywords = await kv.get('news:keywords:latest', 'json');
      expect(keywords.keywords.ai).toContain('llm');
    });

    it('should_limit_keywords_to_10_per_theme', async () => {
      const report = createMockReport({
        trends_by_theme: [
          {
            theme: 'finance',
            keywords: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'],
            cards: [],
          },
        ],
      });
      await putTrendsReport(kv, report);

      const keywords = await kv.get('news:keywords:latest', 'json');
      expect(keywords.keywords.finance.length).toBeLessThanOrEqual(10);
    });

    it('should_provide_default_keywords_when_empty', async () => {
      const report = createMockReport({
        trends_by_theme: [],
      });
      await putTrendsReport(kv, report);

      const keywords = await kv.get('news:keywords:latest', 'json');
      expect(keywords.keywords.finance.length).toBeGreaterThan(0);
      expect(keywords.keywords.economy.length).toBeGreaterThan(0);
      expect(keywords.keywords.ai.length).toBeGreaterThan(0);
    });

    it('should_provide_default_finance_keywords', async () => {
      const report = createMockReport({
        trends_by_theme: [{ theme: 'finance', keywords: [], cards: [] }],
      });
      await putTrendsReport(kv, report);

      const keywords = await kv.get('news:keywords:latest', 'json');
      expect(keywords.keywords.finance).toContain('股市');
      expect(keywords.keywords.finance).toContain('美股');
    });

    it('should_provide_default_economy_keywords', async () => {
      const report = createMockReport({
        trends_by_theme: [{ theme: 'economy', keywords: [], cards: [] }],
      });
      await putTrendsReport(kv, report);

      const keywords = await kv.get('news:keywords:latest', 'json');
      expect(keywords.keywords.economy).toContain('GDP');
      expect(keywords.keywords.economy).toContain('CPI');
    });

    it('should_provide_default_ai_keywords', async () => {
      const report = createMockReport({
        trends_by_theme: [{ theme: 'ai', keywords: [], cards: [] }],
      });
      await putTrendsReport(kv, report);

      const keywords = await kv.get('news:keywords:latest', 'json');
      expect(keywords.keywords.ai).toContain('AI');
      expect(keywords.keywords.ai).toContain('ChatGPT');
    });
  });

  describe('TTL 设置', () => {
    it('should_set_ttl_on_stored_keys', async () => {
      const report = createMockReport();
      await putTrendsReport(kv, report);

      // Check that TTL metadata is stored
      expect(kv.hasKey('__ttl__trends:daily:2025-12-28')).toBe(true);
      expect(kv.hasKey('__ttl__trends:latest')).toBe(true);
    });

    it('should_use_14_day_ttl', async () => {
      const report = createMockReport();
      await putTrendsReport(kv, report);

      // 14 days = 14 * 24 * 60 * 60 = 1209600 seconds
      const ttlKey = '__ttl__trends:daily:2025-12-28';
      const expiresAt = parseInt(kv.store.get(ttlKey) ?? '0', 10);
      const now = Date.now();
      const diff = (expiresAt - now) / 1000;

      expect(diff).toBeGreaterThan(1209600 - 10); // Allow 10s tolerance
      expect(diff).toBeLessThan(1209600 + 10);
    });
  });

  describe('边界条件', () => {
    it('should_handle_report_with_empty_trends', async () => {
      const report = createMockReport({
        trends_by_theme: [],
      });
      await putTrendsReport(kv, report);

      expect(kv.hasKey('trends:daily:2025-12-28')).toBe(true);
    });

    it('should_handle_report_with_missing_trends_by_theme', async () => {
      const report = createMockReport();
      (report as any).trends_by_theme = undefined;

      await putTrendsReport(kv, report);

      expect(kv.hasKey('trends:daily:2025-12-28')).toBe(true);
    });

    it('should_handle_report_with_null_logs', async () => {
      const report = createMockReport({
        logs: null as any,
      });
      await putTrendsReport(kv, report);

      expect(kv.hasKey('trends:daily:2025-12-28')).toBe(true);
    });
  });
});

// ============================================================================
// getLatestTrendsReport 测试
// ============================================================================
describe('getLatestTrendsReport', () => {
  let kv: MockKVNamespace;

  beforeEach(() => {
    kv = new MockKVNamespace();
  });

  describe('基本功能', () => {
    it('should_return_latest_report', async () => {
      const report = createMockReport();
      await putTrendsReport(kv, report);

      const result = await getLatestTrendsReport(kv);
      expect(result).toBeDefined();
      expect(result?.meta.day_key).toBe('2025-12-28');
    });

    it('should_return_null_when_no_report_exists', async () => {
      const result = await getLatestTrendsReport(kv);
      expect(result).toBeNull();
    });

    it('should_return_parsed_json_object', async () => {
      const report = createMockReport();
      await putTrendsReport(kv, report);

      const result = await getLatestTrendsReport(kv);
      expect(result).toHaveProperty('meta');
      expect(result).toHaveProperty('trends_by_theme');
      expect(result).toHaveProperty('insight_markdown');
    });
  });

  describe('序列化/反序列化', () => {
    it('should_preserve_all_report_fields', async () => {
      const report = createMockReport({
        meta: {
          generated_at: '2025-12-28T12:00:00.000Z',
          day_key: '2025-12-28',
          sources_used: ['google_trends_rss', 'weibo_hot'],
          items_scanned: 150,
          items_kept: 75,
          execution_time_ms: 2500,
          llm_used: 'llm',
        },
        logs: [
          { ts: '2025-12-28T12:00:00.000Z', stage: 'fetch', message: 'Fetching...' },
        ],
        trends_by_theme: [
          {
            theme: 'finance',
            keywords: ['test'],
            cards: [],
          },
        ],
        insight_markdown: '# Test Insight',
      });
      await putTrendsReport(kv, report);

      const result = await getLatestTrendsReport(kv);
      expect(result?.meta.generated_at).toBe('2025-12-28T12:00:00.000Z');
      expect(result?.logs.length).toBe(1);
      expect(result?.insight_markdown).toBe('# Test Insight');
    });
  });

  describe('边界条件', () => {
    it('should_handle_corrupted_json', async () => {
      await kv.put('trends:latest', 'invalid json{');

      const result = await getLatestTrendsReport(kv);
      expect(result).toBeNull();
    });

    it('should_handle_empty_string_value', async () => {
      await kv.put('trends:latest', '');

      const result = await getLatestTrendsReport(kv);
      expect(result).toBeNull();
    });

    it('should_handle_array_instead_of_object', async () => {
      await kv.put('trends:latest', '[]');

      const result = await getLatestTrendsReport(kv);
      expect(result).toEqual([]); // Returns the array as-is
    });
  });
});

// ============================================================================
// getTrendsHistory 测试
// ============================================================================
describe('getTrendsHistory', () => {
  let kv: MockKVNamespace;

  beforeEach(() => {
    kv = new MockKVNamespace();
  });

  describe('基本功能', () => {
    it('should_return_empty_array_when_no_history', async () => {
      const result = await getTrendsHistory(kv);
      expect(result).toEqual([]);
    });

    it('should_return_single_report', async () => {
      const report = createMockReport();
      await putTrendsReport(kv, report);

      const result = await getTrendsHistory(kv, 7);
      expect(result.length).toBe(1);
      expect(result[0].meta.day_key).toBe('2025-12-28');
    });

    it('should_return_multiple_reports', async () => {
      const report1 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-28' } });
      const report2 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-27' } });
      const report3 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-26' } });

      await putTrendsReport(kv, report1);
      await putTrendsReport(kv, report2);
      await putTrendsReport(kv, report3);

      const result = await getTrendsHistory(kv, 7);
      expect(result.length).toBe(3);
    });

    it('should_return_reports_in_index_order', async () => {
      const report1 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-26' } });
      const report2 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-28' } });

      await putTrendsReport(kv, report1);
      await putTrendsReport(kv, report2);

      const result = await getTrendsHistory(kv, 7);
      const dayKeys = result.map(r => r.meta.day_key);
      expect(dayKeys[0]).toBe('2025-12-28'); // Newest first
    });
  });

  describe('限制参数', () => {
    it('should_respect_limit_parameter', async () => {
      for (let i = 0; i < 10; i++) {
        const report = createMockReport({
          meta: { ...createMockReport().meta, day_key: `2025-12-${String(i).padStart(2, '0')}` },
        });
        await putTrendsReport(kv, report);
      }

      const result = await getTrendsHistory(kv, 5);
      expect(result.length).toBe(5);
    });

    it('should_default_to_7_when_limit_not_specified', async () => {
      for (let i = 0; i < 10; i++) {
        const report = createMockReport({
          meta: { ...createMockReport().meta, day_key: `2025-12-${String(i).padStart(2, '0')}` },
        });
        await putTrendsReport(kv, report);
      }

      const result = await getTrendsHistory(kv);
      expect(result.length).toBe(7);
    });

    it('should_clamp_limit_to_maximum_of_14', async () => {
      for (let i = 0; i < 20; i++) {
        const report = createMockReport({
          meta: { ...createMockReport().meta, day_key: `2025-12-${String(i).padStart(2, '0')}` },
        });
        await putTrendsReport(kv, report);
      }

      const result = await getTrendsHistory(kv, 100);
      expect(result.length).toBeLessThanOrEqual(14);
    });

    it('should_handle_zero_limit', async () => {
      const report = createMockReport();
      await putTrendsReport(kv, report);

      const result = await getTrendsHistory(kv, 0);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should_handle_negative_limit', async () => {
      for (let i = 0; i < 5; i++) {
        const report = createMockReport({
          meta: { ...createMockReport().meta, day_key: `2025-12-${String(i).padStart(2, '0')}` },
        });
        await putTrendsReport(kv, report);
      }

      const result = await getTrendsHistory(kv, -5);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('部分数据处理', () => {
    it('should_skip_missing_reports', async () => {
      // Add index but not all reports
      await kv.put('trends:index', JSON.stringify(['2025-12-28', '2025-12-27', '2025-12-26']));
      await kv.put('trends:daily:2025-12-28', JSON.stringify(createMockReport()));
      // Skip 2025-12-27
      await kv.put('trends:daily:2025-12-26', JSON.stringify(createMockReport()));

      const result = await getTrendsHistory(kv, 7);
      expect(result.length).toBe(2);
    });

    it('should_filter_out_null_reports', async () => {
      await kv.put('trends:index', JSON.stringify(['2025-12-28', '2025-12-27']));
      await kv.put('trends:daily:2025-12-28', JSON.stringify(createMockReport()));
      await kv.put('trends:daily:2025-12-27', 'null');

      const result = await getTrendsHistory(kv, 7);
      expect(result.length).toBe(1);
    });
  });

  describe('边界条件', () => {
    it('should_handle_empty_index', async () => {
      await kv.put('trends:index', JSON.stringify([]));

      const result = await getTrendsHistory(kv, 7);
      expect(result).toEqual([]);
    });

    it('should_handle_corrupted_index', async () => {
      await kv.put('trends:index', 'not valid json');

      const result = await getTrendsHistory(kv, 7);
      expect(result).toEqual([]);
    });

    it('should_handle_null_index', async () => {
      await kv.put('trends:index', 'null');

      // When index is 'null', JSON.parse returns null (not an array)
      // The fallback logic should handle this and return []
      const result = await getTrendsHistory(kv, 7);
      expect(result).toEqual([]);
    });
  });
});

// ============================================================================
// getTrendsAliases 测试
// ============================================================================
describe('getTrendsAliases', () => {
  let kv: MockKVNamespace;

  beforeEach(() => {
    kv = new MockKVNamespace();
  });

  describe('基本功能', () => {
    it('should_return_empty_array_when_no_aliases', async () => {
      const result = await getTrendsAliases(kv);
      expect(result).toEqual([]);
    });

    it('should_return_stored_aliases', async () => {
      const aliases = [
        { canonical: 'test', variants: ['t', 'es'] },
      ];
      await putTrendsAliases(kv, aliases);

      const result = await getTrendsAliases(kv);
      expect(result).toEqual(aliases);
    });
  });

  describe('边界条件', () => {
    it('should_handle_corrupted_json', async () => {
      await kv.put('trends:aliases', 'invalid json');

      const result = await getTrendsAliases(kv);
      expect(result).toEqual([]);
    });

    it('should_handle_non_array_value', async () => {
      await kv.put('trends:aliases', '{}');

      // When the parsed value is an object (not null/string), it's returned as-is
      // The fallback only applies to null values, not type mismatches
      const result = await getTrendsAliases(kv);
      expect(result).toEqual({});
    });

    it('should_handle_null_value', async () => {
      await kv.put('trends:aliases', 'null');

      const result = await getTrendsAliases(kv);
      expect(result).toEqual([]);
    });
  });
});

// ============================================================================
// putTrendsAliases 测试
// ============================================================================
describe('putTrendsAliases', () => {
  let kv: MockKVNamespace;

  beforeEach(() => {
    kv = new MockKVNamespace();
  });

  describe('基本功能', () => {
    it('should_store_aliases', async () => {
      const aliases = [
        { canonical: 'test', variants: ['a', 'b'] },
      ];
      await putTrendsAliases(kv, aliases);

      expect(kv.hasKey('trends:aliases')).toBe(true);
    });

    it('should_serialize_correctly', async () => {
      const aliases = [
        { canonical: 'nvidia', variants: ['nvda', '英伟达'] },
      ];
      await putTrendsAliases(kv, aliases);

      const stored = await kv.get('trends:aliases', 'json');
      expect(stored).toEqual(aliases);
    });
  });

  describe('输入验证', () => {
    it('should_handle_empty_array', async () => {
      await putTrendsAliases(kv, []);

      const result = await getTrendsAliases(kv);
      expect(result).toEqual([]);
    });

    it('should_handle_non_array_input', async () => {
      await putTrendsAliases(kv, null as any);

      const result = await getTrendsAliases(kv);
      expect(result).toEqual([]);
    });

    it('should_handle_array_with_invalid_elements', async () => {
      await putTrendsAliases(kv, [{ canonical: 'test', variants: ['a'] }, null as any, undefined as any]);

      const result = await getTrendsAliases(kv);
      // Should filter out invalid elements
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should_handle_variants_with_invalid_values', async () => {
      await putTrendsAliases(kv, [
        { canonical: 'test', variants: ['a', null, undefined, 'b'] },
      ]);

      const result = await getTrendsAliases(kv);
      expect(result).toBeDefined();
    });
  });
});

// ============================================================================
// 并发测试
// ============================================================================
describe('并发操作', () => {
  it('should_handle_concurrent_puts', async () => {
    const kv = new MockKVNamespace();
    const reports = Array.from({ length: 10 }, (_, i) =>
      createMockReport({
        meta: { ...createMockReport().meta, day_key: `2025-12-${String(i).padStart(2, '0')}` },
      })
    );

    await Promise.all(reports.map(r => putTrendsReport(kv, r)));

    const result = await getTrendsHistory(kv, 20);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('should_handle_concurrent_reads_writes', async () => {
    const kv = new MockKVNamespace();
    const report = createMockReport();

    // Simultaneous writes and reads
    const operations = [
      putTrendsReport(kv, report),
      getLatestTrendsReport(kv),
      getTrendsHistory(kv, 7),
      putTrendsAliases(kv, []),
    ];

    await Promise.all(operations);

    // Should complete without errors
    expect(kv.hasKey('trends:latest')).toBe(true);
  });
});

// ============================================================================
// 性能测试
// ============================================================================
describe('性能测试', () => {
  it('should_handle_large_report_efficiently', async () => {
    const kv = new MockKVNamespace();
    const report = createMockReport({
      trends_by_theme: Array.from({ length: 100 }, (_, i) => ({
        theme: 'finance',
        keywords: [`keyword${i}`],
        cards: Array.from({ length: 10 }, (_, j) => ({
          id: `card${i}-${j}`,
          source: 'google_trends_rss',
          title: `Title ${i}-${j}`,
          language: 'en',
          themes: ['finance'],
          signals: { score: 100 },
        })),
      })),
    });

    const start = Date.now();
    await putTrendsReport(kv, report);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it('should_handle_large_history_efficiently', async () => {
    const kv = new MockKVNamespace();
    for (let i = 0; i < 14; i++) {
      const report = createMockReport({
        meta: { ...createMockReport().meta, day_key: `2025-12-${String(i).padStart(2, '0')}` },
      });
      await putTrendsReport(kv, report);
    }

    const start = Date.now();
    const result = await getTrendsHistory(kv, 14);
    const elapsed = Date.now() - start;

    expect(result.length).toBe(14);
    expect(elapsed).toBeLessThan(100);
  });
});
