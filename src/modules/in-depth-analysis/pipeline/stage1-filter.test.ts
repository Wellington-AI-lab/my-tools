/**
 * 测试文件：stage1-filter.test.ts
 * 覆盖模块：src/modules/in-depth-analysis/pipeline/stage1-filter.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  stage1Filter,
  parseMetric,
  heatScore,
  DEFAULT_BLACKLIST,
} from './stage1-filter';
import type { RednoteRawItem } from '@/modules/in-depth-analysis/types';

// ============================================================================
// parseMetric Tests
// ============================================================================
describe('parseMetric', () => {
  it('should_return_zero_for_null', () => {
    expect(parseMetric(null)).toBe(0);
    expect(parseMetric(undefined)).toBe(0);
  });

  it('should_return_zero_for_empty_string', () => {
    expect(parseMetric('')).toBe(0);
  });

  it('should_parse_number_directly', () => {
    expect(parseMetric(100)).toBe(100);
    expect(parseMetric(0)).toBe(0);
    expect(parseMetric(123.45)).toBe(123);
    expect(parseMetric(-5)).toBe(0); // Negative becomes 0
  });

  it('should_parse_comma_separated_numbers', () => {
    expect(parseMetric('1,234')).toBe(1234);
    expect(parseMetric('12,345')).toBe(12345);
  });

  it('should_parse_chinese_wan_unit', () => {
    expect(parseMetric('1.2万')).toBe(12000);
    expect(parseMetric('2万')).toBe(20000);
    expect(parseMetric('0.5万')).toBe(5000);
  });

  it('should_parse_chinese_qian_unit', () => {
    expect(parseMetric('1.5千')).toBe(1500);
    expect(parseMetric('3千')).toBe(3000);
  });

  it('should_parse_w_shorthand', () => {
    expect(parseMetric('1.2w')).toBe(12000);
    expect(parseMetric('2W')).toBe(20000);
    expect(parseMetric('0.5w')).toBe(5000);
  });

  it('should_extract_number_from_text', () => {
    expect(parseMetric('赞 980')).toBe(980);
    expect(parseMetric('likes 1234')).toBe(1234);
  });

  it('should_handle_invalid_input', () => {
    expect(parseMetric('abc')).toBe(0);
    expect(parseMetric(Infinity)).toBe(0);
    expect(parseMetric(NaN)).toBe(0);
  });
});

// ============================================================================
// heatScore Tests
// ============================================================================
describe('heatScore', () => {
  it('should_calculate_weighted_score', () => {
    const metrics = {
      likes: 100,
      collects: 50,
      comments: 20,
      shares: 10,
    };
    // 100*1 + 50*3 + 20*5 + 10*5 = 100 + 150 + 100 + 50 = 400
    expect(heatScore(metrics)).toBe(400);
  });

  it('should_return_zero_for_all_zeros', () => {
    const metrics = {
      likes: 0,
      collects: 0,
      comments: 0,
      shares: 0,
    };
    expect(heatScore(metrics)).toBe(0);
  });

  it('should_weight_shares_and_comments_higher', () => {
    const metrics1 = { likes: 100, collects: 0, comments: 0, shares: 0 };
    const metrics2 = { likes: 0, collects: 0, comments: 20, shares: 0 };
    const metrics3 = { likes: 0, collects: 0, comments: 0, shares: 20 };

    expect(heatScore(metrics2)).toBe(heatScore(metrics1));
    expect(heatScore(metrics3)).toBe(heatScore(metrics2));
  });
});

// ============================================================================
// stage1Filter Tests
// ============================================================================
describe('stage1Filter', () => {
  const createMockItem = (overrides = {}): RednoteRawItem => ({
    id: '1',
    title: 'Test Title',
    content: 'Test content',
    likes: 100,
    collects: 50,
    comments: 20,
    shares: 10,
    ...overrides,
  });

  it('should_return_empty_result_for_empty_input', () => {
    // Arrange
    const result = stage1Filter([], {
      heatThreshold: 50,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.cards).toEqual([]);
    expect(result.scanned).toBe(0);
  });

  it('should_filter_by_heat_threshold', () => {
    // Arrange
    const items = [
      createMockItem({ id: '1', likes: 100 }), // heatScore = 100 + 150 + 100 + 50 = 400
      createMockItem({ id: '2', likes: 1, collects: 0, comments: 0, shares: 0 }), // heatScore = 1, below threshold
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 50,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.keptAfterHardFilter).toBe(1);
    expect(result.keptAfterDedup).toBe(1);
    expect(result.cards[0].id).toBe('1');
  });

  it('should_filter_blacklist_keywords', () => {
    // Arrange
    const items = [
      createMockItem({ id: '1', title: '正常内容' }),
      createMockItem({ id: '2', title: '私聊赚钱' }), // Contains blacklist
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: ['私聊'],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.keptAfterHardFilter).toBe(1);
    expect(result.cards[0].id).toBe('1');
  });

  it('should_use_default_blacklist', () => {
    // Arrange
    const items = [
      createMockItem({ id: '1', title: '正常内容' }),
      createMockItem({ id: '2', title: '兼职私聊加V' }), // Contains default blacklist
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: Array.from(DEFAULT_BLACKLIST),
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.keptAfterHardFilter).toBe(1);
  });

  it('should_sort_by_heat_score_descending', () => {
    // Arrange
    const items = [
      createMockItem({ id: '1', title: 'Apple fruit', likes: 10, collects: 0, comments: 0, shares: 0 }), // heatScore = 10
      createMockItem({ id: '2', title: 'Banana yellow', likes: 100, collects: 0, comments: 0, shares: 0 }), // heatScore = 100
      createMockItem({ id: '3', title: 'Cherry red', likes: 50, collects: 0, comments: 0, shares: 0 }), // heatScore = 50
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.cards[0].id).toBe('2');
    expect(result.cards[1].id).toBe('3');
    expect(result.cards[2].id).toBe('1');
  });

  it('should_dedup_similar_titles', () => {
    // Arrange
    const items = [
      createMockItem({ id: '1', title: '测试产品推荐', likes: 100, collects: 0, comments: 0, shares: 0 }),
      createMockItem({ id: '2', title: '测试产品推荐测评', likes: 50, collects: 0, comments: 0, shares: 0 }), // Similar bigrams: "测试产品推荐" is subset
      createMockItem({ id: '3', title: '完全不同的内容', likes: 30, collects: 0, comments: 0, shares: 0 }),
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.5, // Lower threshold for this test
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert - Similar items should be deduplicated
    // "测试产品推荐" bigrams: 测试, 试产, 品推, 推荐
    // "测试产品推荐测评" bigrams: 测试, 试产, 品推, 推荐, 荐测, 测评
    // Intersection: 4, Union: 6, Jaccard: 4/6 = 0.67 >= 0.5
    expect(result.keptAfterHardFilter).toBe(3);
    expect(result.keptAfterDedup).toBe(2);
  });

  it('should_limit_to_max_items', () => {
    // Arrange
    const words = ['Apple', 'Banana', 'Cherry', 'Dragon', 'Eagle', 'Frog', 'Grape', 'Honey', 'Iris', 'Jade',
      'Kiwi', 'Lemon', 'Mango', 'Nectar', 'Ocean', 'Piano', 'Quartz', 'Rose', 'Sun', 'Tiger'];
    const items = Array.from({ length: 20 }, (_, i) =>
      createMockItem({ id: String(i), title: `Product ${words[i]} review ${i}`, likes: 100 + i, collects: 0, comments: 0, shares: 0 })
    );

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 5,
    });

    // Assert
    expect(result.cards).toHaveLength(5);
    expect(result.keptAfterDedup).toBe(5);
  });

  it('should_generate_stable_id_for_missing_id', () => {
    // Arrange
    const items = [
      createMockItem({ id: null, noteId: null, title: 'Test Title', author: 'author1' }),
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.cards[0].id).toMatch(/^mock_/);
  });

  it('should_use_noteId_as_fallback', () => {
    // Arrange
    const items = [
      createMockItem({ id: null, noteId: 'note123' }),
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.cards[0].id).toBe('note123');
  });

  it('should_fallback_to_content_for_title', () => {
    // Arrange
    const items = [
      createMockItem({ title: '', content: 'This is the content' }),
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.cards[0].title).toBe('This is the content');
  });

  it('should_use_default_title_when_empty', () => {
    // Arrange
    const items = [
      createMockItem({ title: '', content: '' }),
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.cards[0].title).toBe('（无标题）');
  });

  it('should_extract_tags', () => {
    // Arrange
    const items = [
      createMockItem({
        tags: ['tag1', 'tag2', 'tag3'],
      }),
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.cards[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('should_limit_tags_to_12', () => {
    // Arrange
    const items = [
      createMockItem({
        tags: Array.from({ length: 20 }, (_, i) => `tag${i}`),
      }),
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.cards[0].tags).toHaveLength(12);
  });

  it('should_normalize_content_fields', () => {
    // Arrange
    const items = [
      createMockItem({
        desc: 'Description text',
        content: null,
      }),
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.cards[0].content).toBe('Description text');
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================
describe('stage1Filter - Edge Cases', () => {
  it('should_handle_null_input', () => {
    // Act
    const result = stage1Filter(null as any, {
      heatThreshold: 50,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.scanned).toBe(0);
    expect(result.cards).toEqual([]);
  });

  it('should_handle_non_array_input', () => {
    // Act
    const result = stage1Filter({} as any, {
      heatThreshold: 50,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert - Non-array input is treated as 0 items scanned
    expect(result.scanned).toBe(0);
    expect(result.cards).toEqual([]);
    expect(result.keptAfterHardFilter).toBe(0);
    expect(result.keptAfterDedup).toBe(0);
  });

  it('should_handle_invalid_metric_values', () => {
    // Arrange
    const items = [
      {
        id: '1',
        title: 'Test',
        likes: 'invalid',
        collects: null,
        comments: undefined,
        shares: '1.2万',
      },
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.cards[0].metrics.likes).toBe(0);
    expect(result.cards[0].metrics.collects).toBe(0);
    expect(result.cards[0].metrics.comments).toBe(0);
    expect(result.cards[0].metrics.shares).toBe(12000);
  });

  it('should_handle_chinese_text_dedup', () => {
    // Arrange
    const items = [
      { id: '1', title: '这是一个测试标题', likes: 100, collects: 0, comments: 0, shares: 0 },
      { id: '2', title: '这是一个测试内容', likes: 100, collects: 0, comments: 0, shares: 0 },
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.5,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert - Similar Chinese titles should be deduplicated
    expect(result.keptAfterDedup).toBeLessThan(result.keptAfterHardFilter);
  });

  it('should_handle_mixed_language_titles', () => {
    // Arrange
    const items = [
      { id: '1', title: '测试Test标题123', likes: 100, collects: 0, comments: 0, shares: 0 },
    ];

    // Act
    const result = stage1Filter(items, {
      heatThreshold: 0,
      dedupTitleSimilarityThreshold: 0.66,
      blacklistKeywords: [],
      maxItemsAfterFilter: 10,
    });

    // Assert
    expect(result.cards).toHaveLength(1);
  });
});
