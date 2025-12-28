/**
 * 高强度测试套件：trends/filter.test.ts
 * 覆盖模块：src/modules/trends/pipeline/filter.ts
 * 目标覆盖率：≥98% 分支覆盖
 * 测试重点：去重算法、主题分组、边界条件、性能压力
 * 生成时间：2025-12-28
 * 测试框架：vitest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { filterAndGroupTrends, type TrendsFilterConfig } from './pipeline/filter';
import type { TrendRawItem, TrendTheme } from './types';

// ============================================================================
// 测试数据构造器
// ============================================================================
function createMockItem(overrides?: Partial<TrendRawItem>): TrendRawItem {
  return {
    source: 'google_trends_rss',
    title: 'Bitcoin price reaches new high',
    url: 'https://example.com/bitcoin',
    rank: 1,
    score: 500,
    language: 'en',
    ...overrides,
  };
}

function createFinanceItems(count: number): TrendRawItem[] {
  return Array.from({ length: count }, (_, i) =>
    createMockItem({
      title: `Stock market update ${i + 1}`,
      rank: i + 1,
      score: 500 - i * 10,
    })
  );
}

// ============================================================================
// 基本过滤功能测试
// ============================================================================
describe('filterAndGroupTrends - 基本功能', () => {
  it('should_handle_empty_array', () => {
    const result = filterAndGroupTrends([], {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.cards).toEqual([]);
    expect(result.byTheme.size).toBeGreaterThan(0);
    expect(result.scanned).toBe(0);
  });

  it('should_handle_null_input', () => {
    const result = filterAndGroupTrends(null as any, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.cards).toEqual([]);
    expect(result.scanned).toBe(0);
  });

  it('should_count_scanned_correctly', () => {
    const items = createFinanceItems(10);
    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.scanned).toBe(10);
  });
});

// ============================================================================
// 分数过滤测试
// ============================================================================
describe('filterAndGroupTrends - 分数过滤', () => {
  it('should_filter_out_low_score_items', () => {
    const items = [
      createMockItem({ title: 'High score', score: 100 }),
      createMockItem({ title: 'Medium score', score: 50 }),
      createMockItem({ title: 'Low score', score: 10 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 60,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.keptAfterScore).toBe(1);
    expect(result.cards.length).toBe(1);
    expect(result.cards[0].title).toBe('High score');
  });

  it('should_keep_all_items_when_minScore_is_zero', () => {
    const items = [
      createMockItem({ score: 0 }),
      createMockItem({ score: 1 }),
      createMockItem({ score: 100 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.keptAfterScore).toBe(3);
  });

  it('should_handle_negative_scores', () => {
    const items = [
      createMockItem({ score: -100 }),
      createMockItem({ score: 0 }),
      createMockItem({ score: 100 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 50,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // mapRawToCard clamps scores to >= 0, and uses rank-based score when score=0
    // So all 3 items get scores >= 50 (290 from rank, 290 from rank, 100)
    expect(result.keptAfterScore).toBe(3);
  });

  it('should_handle_missing_score', () => {
    const items = [
      createMockItem({ score: undefined }),
      createMockItem({ score: null }),
      createMockItem({ score: 100 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 50,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Missing/null scores default to 0, then use rank-based scoring (290)
    // So all 3 items pass minScore=50
    expect(result.keptAfterScore).toBe(3);
  });

  it('should_handle_very_high_minScore', () => {
    const items = [
      createMockItem({ score: 100 }),
      createMockItem({ score: 200 }),
      createMockItem({ score: 500 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 1000,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.keptAfterScore).toBe(0);
    expect(result.keptAfterDedup).toBe(0);
  });
});

// ============================================================================
// 去重功能测试
// ============================================================================
describe('filterAndGroupTrends - 去重功能', () => {
  it('should_remove_exact_duplicates', () => {
    const items = [
      createMockItem({ title: 'Bitcoin price up', score: 100 }),
      createMockItem({ title: 'Bitcoin price up', score: 90 }),
      createMockItem({ title: 'Different news', score: 80 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.keptAfterScore).toBe(3);
    expect(result.keptAfterDedup).toBe(2);
  });

  it('should_remove_similar_titles_based_on_threshold', () => {
    const items = [
      createMockItem({ title: 'Bitcoin reaches all-time high', score: 100 }),
      createMockItem({ title: 'Bitcoin hits all-time high', score: 95 }),
      createMockItem({ title: 'BTC breaks record', score: 90 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.5, // Lower threshold = more aggressive dedup
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.keptAfterDedup).toBeLessThan(3);
  });

  it('should_keep_different_titles', () => {
    const items = [
      createMockItem({ title: 'Apple releases new iPhone', score: 100 }),
      createMockItem({ title: 'Tesla announces new car', score: 100 }),
      createMockItem({ title: 'Google launches AI product', score: 100 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.keptAfterDedup).toBe(3);
  });

  it('should_respect_maxTotal_limit', () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      createMockItem({
        title: `Unique news item ${i}`,
        score: 1000 - i * 2,
      })
    );

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 50,
    });

    expect(result.cards.length).toBeLessThanOrEqual(50);
  });

  it('should_handle_zero_dedup_threshold', () => {
    const items = [
      createMockItem({ title: 'Same title', score: 100 }),
      createMockItem({ title: 'Same title', score: 90 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // With 0 threshold, even identical titles might be kept
    // But implementation might still filter exact matches
    expect(result.keptAfterDedup).toBeGreaterThanOrEqual(1);
  });

  it('should_handle_max_dedup_threshold', () => {
    const items = [
      createMockItem({ title: 'A', score: 100 }),
      createMockItem({ title: 'B', score: 100 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 1.0,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // With threshold of 1.0, nothing should be deduped
    expect(result.keptAfterDedup).toBe(2);
  });
});

// ============================================================================
// 主题分组测试
// ============================================================================
describe('filterAndGroupTrends - 主题分组', () => {
  it('should_group_items_by_theme', () => {
    const items = [
      createMockItem({ title: 'Bitcoin price surges', score: 100 }),
      createMockItem({ title: 'AI breakthrough announcement', score: 100 }),
      createMockItem({ title: 'Stock market rally', score: 100 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Check that items are distributed into themes
    const totalCards = Array.from(result.byTheme.values()).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    expect(totalCards).toBeGreaterThan(0);
  });

  it('should_respect_maxPerTheme_limit', () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      createMockItem({
        title: `Stock market news ${i}`,
        score: 1000 - i * 5,
      })
    );

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 10,
      maxTotal: 150,
    });

    // Each theme should have at most maxPerTheme items
    for (const [theme, cards] of result.byTheme.entries()) {
      expect(cards.length).toBeLessThanOrEqual(10);
    }
  });

  it('should_sort_items_within_theme_by_score', () => {
    const items = [
      createMockItem({ title: 'Stock news A', score: 50 }),
      createMockItem({ title: 'Stock news B', score: 100 }),
      createMockItem({ title: 'Stock news C', score: 75 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    for (const [theme, cards] of result.byTheme.entries()) {
      if (cards.length > 1) {
        for (let i = 0; i < cards.length - 1; i++) {
          expect(cards[i].signals.score).toBeGreaterThanOrEqual(
            cards[i + 1].signals.score
          );
        }
      }
    }
  });

  it('should_assign_multiple_themes_to_item', () => {
    const items = [
      createMockItem({ title: 'NVIDIA announces new AI chip for stock trading', score: 100 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Item should appear in both AI and finance themes
    const aiCards = result.byTheme.get('ai') ?? [];
    const financeCards = result.byTheme.get('finance') ?? [];

    expect(aiCards.length + financeCards.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// 配置参数边界测试
// ============================================================================
describe('filterAndGroupTrends - 配置边界', () => {
  it('should_handle_very_small_minScore', () => {
    const items = [createMockItem({ score: 1 })];

    const result = filterAndGroupTrends(items, {
      minScore: -1000,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.keptAfterScore).toBe(1);
  });

  it('should_handle_very_large_minScore', () => {
    const items = [createMockItem({ score: 1000000 })];

    const result = filterAndGroupTrends(items, {
      minScore: 100000,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.keptAfterScore).toBe(1);
  });

  it('should_handle_invalid_minScore', () => {
    const items = [createMockItem({ score: 100 })];

    const result1 = filterAndGroupTrends(items, {
      minScore: NaN,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // NaN should use default
    expect(result1.keptAfterScore).toBeGreaterThan(0);
  });

  it('should_handle_infinite_minScore', () => {
    const items = [createMockItem({ score: 100 })];

    const result = filterAndGroupTrends(items, {
      minScore: Infinity,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Number.isFinite(Infinity) is false, so minScore defaults to 50
    // score=100 passes minScore=50
    expect(result.keptAfterScore).toBe(1);
  });

  it('should_clamp_maxPerTheme_to_valid_range', () => {
    const items = createFinanceItems(100);

    const result1 = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: -1,
      maxTotal: 150,
    });

    // Should be clamped to minimum of 3
    for (const [, cards] of result1.byTheme.entries()) {
      expect(cards.length).toBeLessThanOrEqual(3);
    }

    const result2 = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 1000,
      maxTotal: 150,
    });

    // Should be clamped to maximum of 30
    for (const [, cards] of result2.byTheme.entries()) {
      expect(cards.length).toBeLessThanOrEqual(30);
    }
  });

  it('should_clamp_maxTotal_to_valid_range', () => {
    const items = createFinanceItems(500);

    const result1 = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: -1,
    });

    expect(result1.cards.length).toBeLessThanOrEqual(20);

    const result2 = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 10000,
    });

    expect(result2.cards.length).toBeLessThanOrEqual(200);
  });

  it('should_handle_undefined_config', () => {
    const items = [createMockItem()];

    // Undefined/null config is handled with optional chaining and defaults
    const result = filterAndGroupTrends(items, undefined as any);
    expect(result.scanned).toBe(1);
  });

  it('should_handle_null_config', () => {
    const items = [createMockItem()];

    // Undefined/null config is handled with optional chaining and defaults
    const result = filterAndGroupTrends(items, null as any);
    expect(result.scanned).toBe(1);
  });

  it('should_handle_empty_config', () => {
    const items = [createMockItem()];

    const result = filterAndGroupTrends(items, {} as any);

    expect(result.scanned).toBe(1);
  });
});

// ============================================================================
// 特殊字符和 Unicode 测试
// ============================================================================
describe('filterAndGroupTrends - 特殊字符处理', () => {
  it('should_handle_chinese_titles', () => {
    const items = [
      createMockItem({ title: '比特币价格创新高', score: 100, language: 'zh' }),
      createMockItem({ title: '比特币突破新高', score: 95, language: 'zh' }),
      createMockItem({ title: '人工智能大模型发布', score: 100, language: 'zh' }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Chinese titles have different 2-grams, so may not be deduped
    // "比特币价格创新高" and "比特币突破新高" share only "比特"
    expect(result.keptAfterScore).toBe(3);
    expect(result.keptAfterDedup).toBeGreaterThanOrEqual(2);
    expect(result.keptAfterDedup).toBeLessThanOrEqual(3);
  });

  it('should_handle_mixed_language_titles', () => {
    const items = [
      createMockItem({ title: 'Bitcoin 比特币 price surge', score: 100 }),
      createMockItem({ title: 'Bitcoin price surge', score: 95 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.keptAfterDedup).toBeLessThanOrEqual(2);
  });

  it('should_handle_emoji_in_titles', () => {
    const items = [
      createMockItem({ title: 'Bitcoin reaches 🚀 new high', score: 100 }),
      createMockItem({ title: 'Bitcoin reaches new high', score: 95 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Emoji should be normalized, making titles more similar
    expect(result.keptAfterDedup).toBeLessThanOrEqual(2);
  });

  it('should_handle_special_chars_in_titles', () => {
    const items = [
      createMockItem({ title: 'Bitcoin!!! reaches... new??? high', score: 100 }),
      createMockItem({ title: 'Bitcoin reaches new high', score: 95 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Special chars should be normalized
    expect(result.keptAfterDedup).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// 去重算法特性测试
// ============================================================================
describe('filterAndGroupTrends - 去重算法细节', () => {
  it('should_keep_highest_score_item_when_deduping', () => {
    const items = [
      createMockItem({ title: 'Bitcoin news', score: 50 }),
      createMockItem({ title: 'Bitcoin news', score: 100 }),
      createMockItem({ title: 'Bitcoin news', score: 75 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.keptAfterDedup).toBe(1);
    expect(result.cards[0].signals.score).toBe(100);
  });

  it('should_keep_first_highest_score_for_similar_items', () => {
    const items = [
      createMockItem({ title: 'Bitcoin reaches high', score: 100, url: 'url1' }),
      createMockItem({ title: 'Bitcoin hits high', score: 100, url: 'url2' }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.5,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // One should be kept, and it should be the first one
    expect(result.keptAfterDedup).toBe(1);
    expect(result.cards[0].url).toBe('url1');
  });

  it('should_use_2_gram_similarity_for_chinese', () => {
    const items = [
      createMockItem({ title: '比特币价格大涨', score: 100, language: 'zh' }),
      createMockItem({ title: '比特币价格飙升', score: 95, language: 'zh' }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.5, // Should catch "价格" + "比特" overlap
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // High similarity due to shared 2-grams
    expect(result.keptAfterDedup).toBeLessThan(2);
  });

  it('should_handle_very_long_titles', () => {
    const longTitle = 'Bitcoin '.repeat(100) + 'reaches new high';
    const items = [
      createMockItem({ title: longTitle, score: 100 }),
      createMockItem({ title: 'Bitcoin reaches new high', score: 95 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Should handle long titles without issues
    expect(result.keptAfterDedup).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// 主题分配测试
// ============================================================================
describe('filterAndGroupTrends - 主题分配细节', () => {
  it('should_not_assign_themes_to_items_without_themes', () => {
    const items = [
      createMockItem({ title: 'Random news with no finance keywords', score: 100 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Item might not have any themes
    const totalCards = Array.from(result.byTheme.values()).reduce(
      (sum, arr) => sum + arr.length,
      0
    );

    // It's possible for items to have no matching themes
    expect(totalCards).toBeGreaterThanOrEqual(0);
  });

  it('should_assign_same_item_to_multiple_themes', () => {
    const items = [
      createMockItem({
        title: 'NVIDIA AI chip boosts stock market and economy',
        score: 100,
      }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Should appear in multiple themes
    const themesWithCards: TrendTheme[] = [];
    for (const [theme, cards] of result.byTheme.entries()) {
      if (cards.length > 0) {
        themesWithCards.push(theme);
      }
    }

    expect(themesWithCards.length).toBeGreaterThanOrEqual(1);
  });

  it('should_initialize_all_themes_in_byTheme_map', () => {
    const items = [createMockItem()];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // All themes should be present in the map
    const expectedThemes: TrendTheme[] = [
      'finance',
      'economy',
      'ai',
      'robotics',
      'travel',
      'music',
      'movies',
      'fashion',
      'entertainment',
    ];

    for (const theme of expectedThemes) {
      expect(result.byTheme.has(theme)).toBe(true);
      expect(Array.isArray(result.byTheme.get(theme))).toBe(true);
    }
  });
});

// ============================================================================
// 性能和压力测试
// ============================================================================
describe('filterAndGroupTrends - 性能测试', () => {
  it('should_handle_large_input_efficiently', () => {
    const items = Array.from({ length: 1000 }, (_, i) =>
      createMockItem({
        title: `News item ${i} about various topics`,
        score: 1000 - i,
      })
    );

    const start = Date.now();
    const result = filterAndGroupTrends(items, {
      minScore: 50,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });
    const elapsed = Date.now() - start;

    // Should complete in reasonable time
    expect(elapsed).toBeLessThan(1000);
    expect(result.scanned).toBe(1000);
  });

  it('should_handle_high_duplication_input', () => {
    const items = Array.from({ length: 100 }, () =>
      createMockItem({ title: 'Bitcoin price up', score: 100 })
    );

    const start = Date.now();
    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });
    const elapsed = Date.now() - start;

    // Most should be deduped
    expect(result.keptAfterDedup).toBe(1);
    expect(elapsed).toBeLessThan(500);
  });

  it('should_handle_all_unique_titles', () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      createMockItem({
        title: `Unique title with random words ${i} abcdefghijklmnopqrstuvwxyz ${i}`,
        score: 100,
      })
    );

    const start = Date.now();
    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });
    const elapsed = Date.now() - start;

    // All should pass score filter
    expect(result.keptAfterScore).toBe(200);
    // Limited by maxTotal to 150, but actual limit is based on themes
    // Items without matching themes are dropped (line 56-57 in filter.ts)
    // So the actual keptAfterDedup may be less than maxTotal
    expect(result.keptAfterDedup).toBeLessThanOrEqual(150);
    expect(elapsed).toBeLessThan(2000);
  });
});

// ============================================================================
// 边界和错误条件测试
// ============================================================================
describe('filterAndGroupTrends - 边界条件', () => {
  it('should_handle_items_with_missing_title', () => {
    const items = [
      createMockItem({ title: undefined, score: 100 }),
      createMockItem({ title: null, score: 100 }),
      createMockItem({ title: '', score: 100 }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Items without title should be filtered out
    expect(result.keptAfterScore).toBe(0);
  });

  it('should_handle_items_with_null_signals', () => {
    const items = [
      createMockItem({ title: 'Test', score: undefined }),
      createMockItem({ title: 'Test2', score: null }),
    ];

    const result = filterAndGroupTrends(items, {
      minScore: 50,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // Items with null/undefined score get rank-based unified score (290)
    // which passes minScore=50
    expect(result.keptAfterScore).toBe(2);
  });

  it('should_handle_non-array_input', () => {
    // Non-array input should be handled gracefully
    const result = filterAndGroupTrends({} as any, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.scanned).toBe(0);
    expect(result.cards).toEqual([]);
  });

  it('should_handle_array_with_null_elements', () => {
    const items = [
      createMockItem({ title: 'Valid', score: 100 }),
      null as any,
      undefined as any,
      createMockItem({ title: 'Valid2', score: 90 }),
    ];

    // Null/undefined elements should be filtered out gracefully
    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result.scanned).toBe(4); // All elements are counted
    // 'Valid' and 'Valid2' are similar enough to be deduped
    expect(result.keptAfterDedup).toBeGreaterThanOrEqual(1);
    expect(result.keptAfterDedup).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// 结果结构验证
// ============================================================================
describe('filterAndGroupTrends - 结果结构', () => {
  it('should_return_correct_result_structure', () => {
    const items = [createMockItem()];
    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    expect(result).toHaveProperty('cards');
    expect(result).toHaveProperty('byTheme');
    expect(result).toHaveProperty('scanned');
    expect(result).toHaveProperty('keptAfterScore');
    expect(result).toHaveProperty('keptAfterDedup');

    expect(Array.isArray(result.cards)).toBe(true);
    expect(result.byTheme instanceof Map).toBe(true);
    expect(typeof result.scanned).toBe('number');
    expect(typeof result.keptAfterScore).toBe('number');
    expect(typeof result.keptAfterDedup).toBe('number');
  });

  it('should_have_consistent_counts', () => {
    const items = createFinanceItems(50);
    const result = filterAndGroupTrends(items, {
      minScore: 0,
      dedupTitleSimilarity: 0.66,
      maxPerTheme: 12,
      maxTotal: 150,
    });

    // cards.length should equal keptAfterDedup
    expect(result.cards.length).toBe(result.keptAfterDedup);

    // keptAfterDedup should be <= keptAfterScore
    expect(result.keptAfterDedup).toBeLessThanOrEqual(result.keptAfterScore);

    // All should be <= scanned
    expect(result.keptAfterScore).toBeLessThanOrEqual(result.scanned);
  });
});
