/**
 * Tests for Pure D1 Store
 * Architecture: Single table (trend_reports) with JSON payload
 */

import { describe, it, expect, vi } from 'vitest';
import {
  trendsDayKey,
  putTrendsReport,
  getLatestTrendsReport,
  getTrendsReport,
  getTrendsHistory,
  getTrendsIndex,
  deleteOldReports,
  getTrendsAliases,
  putTrendsAliases,
  getNewsKeywords,
} from './store';
import type { TrendsReport } from '../types';

// ============================================================================
// Mock D1 Database
// ============================================================================
class MockD1Database implements D1Database {
  private store = new Map<string, { payload: string; created_at: string }>();

  prepare(stmt: string): D1PreparedStatement {
    const self = this;

    const stmtObj = {
      bind(...params: any[]) {
        const boundParams = params;
        return {
          async run() {
            const now = new Date().toISOString();

            // INSERT OR REPLACE
            if (stmt.includes('INSERT') && stmt.includes('ON CONFLICT')) {
              const dayKey = boundParams[0];
              const payload = boundParams[1];
              self.store.set(dayKey, { payload, created_at: now });
              return { success: true, meta: { duration: 1, changes: 1 } };
            }

            // DELETE old records
            if (stmt.includes('DELETE') && stmt.includes('datetime')) {
              const retentionDays = boundParams[0];
              const cutoff = new Date();
              cutoff.setDate(cutoff.getDate() - retentionDays);
              let count = 0;
              for (const [key, value] of self.store.entries()) {
                if (new Date(value.created_at) < cutoff) {
                  self.store.delete(key);
                  count++;
                }
              }
              return { success: true, meta: { duration: 1, changes: count } };
            }

            return { success: true, meta: { duration: 1, changes: 0 } };
          },
          async all() {
            // SELECT payload ORDER BY day_key DESC
            if (stmt.includes('SELECT') && stmt.includes('payload')) {
              const limit = boundParams[0];
              const entries = Array.from(self.store.entries())
                .sort((a, b) => b[0].localeCompare(a[0]))
                .slice(0, limit);
              return { results: entries.map(e => ({ payload: e[1].payload })) };
            }

            // SELECT day_key ORDER BY day_key DESC
            if (stmt.includes('SELECT') && stmt.includes('day_key')) {
              const limit = boundParams[0];
              const keys = Array.from(self.store.keys())
                .sort().reverse()
                .slice(0, limit);
              return { results: keys.map(k => ({ day_key: k })) };
            }

            return { results: [] };
          },
          async first() {
            // SELECT with LIMIT 1
            if (stmt.includes('SELECT') && stmt.includes('LIMIT 1')) {
              if (stmt.includes('WHERE day_key = ?')) {
                const dayKey = boundParams[0];
                const entry = self.store.get(dayKey);
                if (entry) {
                  return { payload: entry.payload };
                }
                return null;
              }
              // Latest report
              const latestKey = Array.from(self.store.keys()).sort().reverse()[0];
              if (latestKey) {
                return { payload: self.store.get(latestKey)!.payload };
              }
              return null;
            }
            return null;
          },
        };
      },
      async run(params?: any) {
        return this.bind(...(params || [])).run();
      },
      async all(params?: any) {
        return this.bind(...(params || [])).all();
      },
      async first(params?: any) {
        return this.bind(...(params || [])).first();
      },
    } as D1PreparedStatement;

    return stmtObj;
  }

  // Helpers
  size(): number {
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
// Mock KV (minimal - only for aliases and cache)
// ============================================================================
class MockKVNamespace implements KVNamespace {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null>;
  async get(key: string, type: 'text'): Promise<string | null>;
  async get(key: string, type: 'json'): Promise<any>;
  async get(key: string, type: string | { type: string }): Promise<string | null | any> {
    const value = this.store.get(key);
    const typeStr = typeof type === 'string' ? type : type?.type;
    if (typeStr === 'json') {
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value ?? null;
  }

  async put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

// ============================================================================
// Test Data
// ============================================================================
function createMockReport(overrides?: Partial<TrendsReport>): TrendsReport {
  return {
    meta: {
      generated_at: '2025-12-28T00:00:00.000Z',
      day_key: '2025-12-28',
      sources_used: ['google_trends_rss'],
      items_scanned: 100,
      items_kept: 50,
      execution_time_ms: 1000,
      llm_used: 'llm',
    },
    logs: [],
    trends_by_theme: [{
      theme: 'finance',
      keywords: ['bitcoin'],
      cards: [{
        id: 'test1',
        source: 'google_trends_rss',
        title: 'Bitcoin price up',
        language: 'en',
        themes: ['finance'],
        signals: { score: 100 },
      }],
    }],
    insight_markdown: 'Test insight',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================
describe('store (Pure D1)', () => {
  describe('putTrendsReport', () => {
    it('should store report in D1', async () => {
      const d1 = new MockD1Database();
      const report = createMockReport();

      await putTrendsReport(d1, report);

      expect(d1.size()).toBe(1);
      expect(d1.hasKey('2025-12-28')).toBe(true);
    });

    it('should upsert existing day_key', async () => {
      const d1 = new MockD1Database();
      const report1 = createMockReport();
      const report2 = createMockReport({
        meta: { ...report1.meta, items_scanned: 200 },
      });

      await putTrendsReport(d1, report1);
      await putTrendsReport(d1, report2);

      expect(d1.size()).toBe(1);
    });

    it('should throw error when day_key missing', async () => {
      const d1 = new MockD1Database();
      const report = createMockReport({ meta: { ...createMockReport().meta, day_key: '' as any } });

      await expect(putTrendsReport(d1, report)).rejects.toThrow('day_key is missing');
    });

    it('should throw error when payload exceeds D1 limit', async () => {
      const d1 = new MockD1Database();
      const report = createMockReport();

      // Create a massive report (> 900KB)
      const hugeReport = {
        ...report,
        trends_by_theme: Array.from({ length: 100 }, (_, i) => ({
          theme: `theme_${i}`,
          keywords: Array.from({ length: 50 }, (_, j) => `kw_${j}`),
          cards: Array.from({ length: 100 }, (_, j) => ({
            id: `card_${i}_${j}`,
            source: 'test',
            title: 'x'.repeat(500),
            url: 'https://example.com',
            language: 'en',
            themes: ['test'],
            signals: { score: 100 },
            excerpt: 'y'.repeat(1000),
          })),
        })),
      };

      // Verify the payload would be too large
      const payloadSize = JSON.stringify(hugeReport).length;
      expect(payloadSize).toBeGreaterThan(900_000);

      await expect(putTrendsReport(d1, hugeReport)).rejects.toThrow(/too large/i);
    });

    it('should optionally cache in KV', async () => {
      const d1 = new MockD1Database();
      const kv = new MockKVNamespace();
      const report = createMockReport();

      await putTrendsReport(d1, report, kv);

      const cached = await kv.get('trends:latest', 'json');
      expect(cached).toBeDefined();
    });
  });

  describe('getLatestTrendsReport', () => {
    it('should return null when empty', async () => {
      const d1 = new MockD1Database();

      const result = await getLatestTrendsReport(d1);

      expect(result).toBeNull();
    });

    it('should return latest report', async () => {
      const d1 = new MockD1Database();
      const report1 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-27' } });
      const report2 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-28' } });

      await putTrendsReport(d1, report1);
      await putTrendsReport(d1, report2);

      const result = await getLatestTrendsReport(d1);

      expect(result?.meta.day_key).toBe('2025-12-28');
    });

    it('should use KV cache if available', async () => {
      const d1 = new MockD1Database();
      const kv = new MockKVNamespace();
      const report = createMockReport();

      await putTrendsReport(d1, report, kv);
      const result = await getLatestTrendsReport(d1, kv);

      expect(result?.meta.day_key).toBe('2025-12-28');
    });
  });

  describe('getTrendsReport', () => {
    it('should return specific report by day_key', async () => {
      const d1 = new MockD1Database();
      const report1 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-27' } });
      const report2 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-28' } });

      await putTrendsReport(d1, report1);
      await putTrendsReport(d1, report2);

      const result = await getTrendsReport(d1, '2025-12-27');

      expect(result?.meta.day_key).toBe('2025-12-27');
    });

    it('should return null for missing day_key', async () => {
      const d1 = new MockD1Database();

      const result = await getTrendsReport(d1, '2025-12-28');

      expect(result).toBeNull();
    });
  });

  describe('getTrendsHistory', () => {
    it('should return empty array when empty', async () => {
      const d1 = new MockD1Database();

      const result = await getTrendsHistory(d1);

      expect(result).toEqual([]);
    });

    it('should return reports in desc order', async () => {
      const d1 = new MockD1Database();
      const report1 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-26' } });
      const report2 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-28' } });
      const report3 = createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-27' } });

      await putTrendsReport(d1, report1);
      await putTrendsReport(d1, report2);
      await putTrendsReport(d1, report3);

      const result = await getTrendsHistory(d1, 10);
      const dayKeys = result.map(r => r.meta.day_key);

      expect(dayKeys).toEqual(['2025-12-28', '2025-12-27', '2025-12-26']);
    });

    it('should respect limit parameter', async () => {
      const d1 = new MockD1Database();
      for (let i = 0; i < 10; i++) {
        await putTrendsReport(d1, createMockReport({
          meta: { ...createMockReport().meta, day_key: `2025-12-${String(i).padStart(2, '0')}` },
        }));
      }

      const result = await getTrendsHistory(d1, 5);

      expect(result.length).toBe(5);
    });

    it('should clamp limit to 14', async () => {
      const d1 = new MockD1Database();
      for (let i = 0; i < 20; i++) {
        await putTrendsReport(d1, createMockReport({
          meta: { ...createMockReport().meta, day_key: `2025-12-${String(i).padStart(2, '0')}` },
        }));
      }

      const result = await getTrendsHistory(d1, 100);

      expect(result.length).toBeLessThanOrEqual(14);
    });
  });

  describe('getTrendsIndex', () => {
    it('should return day_keys only', async () => {
      const d1 = new MockD1Database();
      await putTrendsReport(d1, createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-28' } }));
      await putTrendsReport(d1, createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-27' } }));

      const index = await getTrendsIndex(d1);

      expect(index).toEqual(['2025-12-28', '2025-12-27']);
    });
  });

  describe('deleteOldReports', () => {
    it('should delete records older than retention days', async () => {
      const d1 = new MockD1Database();

      // Add some reports
      await putTrendsReport(d1, createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-28' } }));
      await putTrendsReport(d1, createMockReport({ meta: { ...createMockReport().meta, day_key: '2025-12-27' } }));

      // Mock created_at for older record
      (d1 as any).store.get('2025-12-27')!.created_at = new Date('2025-12-01').toISOString();

      const result = await deleteOldReports(d1, 14);

      // Old record should be deleted
      expect(result.count).toBeGreaterThan(0);
    });
  });

  describe('aliases (KV)', () => {
    it('should store and retrieve aliases', async () => {
      const kv = new MockKVNamespace();
      const aliases = [{ canonical: 'test', variants: ['t', 'es'] }];

      await putTrendsAliases(kv, aliases);
      const result = await getTrendsAliases(kv);

      expect(result).toEqual(aliases);
    });

    it('should return empty array when no aliases', async () => {
      const kv = new MockKVNamespace();

      const result = await getTrendsAliases(kv);

      expect(result).toEqual([]);
    });
  });

  describe('getNewsKeywords', () => {
    it('should return cached keywords', async () => {
      const kv = new MockKVNamespace();
      const keywords = {
        keywords: { finance: ['bitcoin'], economy: [], ai: [] },
        updatedAt: new Date().toISOString(),
        fromDayKey: '2025-12-28',
      };
      await kv.put('news:keywords:latest', JSON.stringify(keywords));

      const result = await getNewsKeywords(kv);

      expect(result).toEqual(keywords);
    });

    it('should return null when no cache', async () => {
      const kv = new MockKVNamespace();

      const result = await getNewsKeywords(kv);

      expect(result).toBeNull();
    });
  });

  describe('trendsDayKey', () => {
    it('should format day key', () => {
      expect(trendsDayKey('2025-12-28')).toBe('trends:daily:2025-12-28');
    });
  });
});
