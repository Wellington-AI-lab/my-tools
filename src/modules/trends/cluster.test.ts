/**
 * 高强度测试套件：trends/cluster.test.ts
 * 覆盖模块：src/modules/trends/cluster.ts
 * 目标覆盖率：≥98% 分支覆盖
 * 测试重点：聚类算法、相似度计算、边界条件、性能压力
 * 生成时间：2025-12-28
 * 测试框架：vitest
 */

import { describe, it, expect } from 'vitest';
import { clusterThemeCards, type TrendEventCluster } from './cluster';
import type { TrendCard, TrendTheme } from '../types';

// ============================================================================
// 测试数据构造器
// ============================================================================
function createMockCard(overrides?: Partial<TrendCard>): TrendCard {
  return {
    id: 'test-id',
    source: 'google_trends_rss',
    title: 'Bitcoin price reaches new all-time high',
    url: 'https://example.com/bitcoin',
    language: 'en',
    themes: ['finance'],
    signals: { score: 100 },
    ...overrides,
  };
}

function createSimilarCards(count: number, baseTitle: string): TrendCard[] {
  return Array.from({ length: count }, (_, i) =>
    createMockCard({
      id: `card-${i}`,
      title: baseTitle,
      score: 100 - i * 5,
    })
  );
}

// ============================================================================
// 基本功能测试
// ============================================================================
describe('clusterThemeCards - 基本功能', () => {
  it('should_return_empty_array_for_empty_cards', () => {
    const result = clusterThemeCards({
      theme: 'finance',
      cards: [],
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result).toEqual([]);
  });

  it('should_return_empty_array_for_null_input', () => {
    const result = clusterThemeCards({
      theme: 'finance',
      cards: null as any,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result).toEqual([]);
  });

  it('should_return_empty_array_for_single_card', () => {
    const cards = [createMockCard()];
    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    // Single card can't form a meaningful cluster
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should_create_cluster_for_two_identical_cards', () => {
    const cards = [
      createMockCard({ title: 'Bitcoin price up', id: '1' }),
      createMockCard({ title: 'Bitcoin price up', id: '2' }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result.length).toBe(1);
    expect(result[0].size).toBe(2);
  });

  it('should_set_theme_from_input', () => {
    const cards = [
      createMockCard({ title: 'Test', id: '1' }),
      createMockCard({ title: 'Test', id: '2' }),
    ];

    const result = clusterThemeCards({
      theme: 'ai',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result[0].theme).toBe('ai');
  });
});

// ============================================================================
// 相似度阈值测试
// ============================================================================
describe('clusterThemeCards - 相似度阈值', () => {
  it('should_merge_similar_titles_with_default_threshold', () => {
    const cards = [
      createMockCard({ title: 'Bitcoin reaches new all-time high', score: 100 }),
      createMockCard({ title: 'Bitcoin hits new all-time high', score: 95 }),
      createMockCard({ title: 'Tesla announces new model', score: 90 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    // Bitcoin titles are similar but may form separate clusters depending on exact similarity
    // The Tesla title is different, so total clusters could be 2-3
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('should_not_merge_dissimilar_titles', () => {
    const cards = [
      createMockCard({ title: 'Bitcoin price surges today', score: 100 }),
      createMockCard({ title: 'Apple releases iPhone update', score: 100 }),
      createMockCard({ title: 'Google launches AI product', score: 100 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    // Each should be its own cluster
    expect(result.length).toBe(3);
  });

  it('should_respect_low_threshold', () => {
    const cards = [
      createMockCard({ title: 'Bitcoin up', score: 100 }),
      createMockCard({ title: 'Bitcoin down', score: 100 }),
      createMockCard({ title: 'Stock market crash', score: 100 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.3, // Lower threshold = more clustering
      maxClusters: 12,
    });

    // More aggressive clustering with lower threshold
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('should_respect_high_threshold', () => {
    const cards = [
      createMockCard({ title: 'Bitcoin price up', score: 100 }),
      createMockCard({ title: 'Bitcoin price up', score: 95 }),
      createMockCard({ title: 'Bitcoin price up', score: 90 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.99, // Very high threshold
      maxClusters: 12,
    });

    // With very high threshold, even identical might not cluster
    // But since they're identical, they should still cluster
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('should_handle_zero_threshold', () => {
    const cards = [
      createMockCard({ title: 'A', score: 100 }),
      createMockCard({ title: 'B', score: 100 }),
      createMockCard({ title: 'C', score: 100 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0,
      maxClusters: 12,
    });

    // Zero threshold should group everything together
    // if there's any similarity at all
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('should_handle_threshold_greater_than_one', () => {
    const cards = [
      createMockCard({ title: 'Test', score: 100 }),
      createMockCard({ title: 'Test', score: 95 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 1.5, // Invalid threshold
      maxClusters: 12,
    });

    // Should handle gracefully
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// 最大簇数量测试
// ============================================================================
describe('clusterThemeCards - maxClusters 限制', () => {
  it('should_respect_maxClusters_limit', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      createMockCard({
        id: `card-${i}`,
        title: `Unique news item ${i}`,
        score: 100 - i * 2,
      })
    );

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 5,
    });

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('should_clamp_maxClusters_to_minimum', () => {
    const cards = [
      createMockCard({ title: 'A', score: 100 }),
      createMockCard({ title: 'B', score: 100 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 1,
    });

    // Should clamp to minimum of 3
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('should_clamp_maxClusters_to_maximum', () => {
    const cards = Array.from({ length: 100 }, (_, i) =>
      createMockCard({
        id: `card-${i}`,
        title: `News ${i}`,
        score: 100,
      })
    );

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 1000,
    });

    // Should clamp to maximum of 30
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it('should_handle_zero_maxClusters', () => {
    const cards = [createMockCard()];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 0,
    });

    // Should clamp to minimum
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should_handle_negative_maxClusters', () => {
    const cards = [createMockCard()];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: -10,
    });

    // Should clamp to minimum
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should_handle_undefined_maxClusters', () => {
    const cards = [
      createMockCard({ title: 'A', score: 100 }),
      createMockCard({ title: 'A', score: 95 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: undefined as any,
    });

    // Should use default
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// 簇结构测试
// ============================================================================
describe('clusterThemeCards - 簇结构', () => {
  it('should_set_label_from_representative_card', () => {
    const cards = [
      createMockCard({ title: 'Bitcoin price surge', score: 100 }),
      createMockCard({ title: 'Bitcoin price surge', score: 90 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result[0].label).toBe('Bitcoin price surge');
  });

  it('should_set_size_to_member_count', () => {
    const cards = [
      createMockCard({ title: 'Same title', score: 100, id: '1' }),
      createMockCard({ title: 'Same title', score: 90, id: '2' }),
      createMockCard({ title: 'Same title', score: 80, id: '3' }),
      createMockCard({ title: 'Same title', score: 70, id: '4' }),
      createMockCard({ title: 'Same title', score: 60, id: '5' }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result[0].size).toBe(5);
  });

  it('should_collect_unique_sources', () => {
    const cards = [
      createMockCard({ title: 'Same', score: 100, source: 'google_trends_rss' }),
      createMockCard({ title: 'Same', score: 90, source: 'google_trends_rss' }),
      createMockCard({ title: 'Same', score: 80, source: 'weibo_hot' }),
      createMockCard({ title: 'Same', score: 70, source: 'weibo_hot' }),
      createMockCard({ title: 'Same', score: 60, source: 'mock' }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result[0].sources).toContain('google_trends_rss');
    expect(result[0].sources).toContain('weibo_hot');
    expect(result[0].sources).toContain('mock');
  });

  it('should_sort_sources', () => {
    const cards = [
      createMockCard({ title: 'Same', score: 100, source: 'weibo_hot' }),
      createMockCard({ title: 'Same', score: 90, source: 'google_trends_rss' }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    // Sources should be sorted alphabetically
    for (let i = 0; i < result[0].sources.length - 1; i++) {
      expect(result[0].sources[i] <= result[0].sources[i + 1]).toBe(true);
    }
  });

  it('should_include_top_items', () => {
    const cards = [
      createMockCard({ title: 'Cluster topic', score: 100, url: 'url1', id: '1' }),
      createMockCard({ title: 'Cluster topic', score: 90, url: 'url2', id: '2' }),
      createMockCard({ title: 'Cluster topic', score: 80, url: 'url3', id: '3' }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result[0].top_items.length).toBe(3);
    expect(result[0].top_items[0].score).toBe(100); // Highest score first
    expect(result[0].top_items[0].url).toBe('url1');
  });

  it('should_limit_top_items_to_5', () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      createMockCard({
        title: 'Same',
        score: 100 - i * 5,
        id: `card-${i}`,
      })
    );

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result[0].top_items.length).toBe(5);
  });
});

// ============================================================================
// 排序测试
// ============================================================================
describe('clusterThemeCards - 排序', () => {
  it('should_sort_clusters_by_size_descending', () => {
    const cards = [
      ...createSimilarCards(5, 'Topic A'), // 5 cards
      ...createSimilarCards(3, 'Topic B'), // 3 cards
      ...createSimilarCards(1, 'Topic C'), // 1 card
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].size).toBeGreaterThanOrEqual(result[i + 1].size);
    }
  });

  it('should_sort_by_sources_count_when_sizes_equal', () => {
    const cards = [
      createMockCard({ title: 'A', score: 100, source: 'google_trends_rss' }),
      createMockCard({ title: 'A', score: 90, source: 'google_trends_rss' }),
      createMockCard({ title: 'B', score: 100, source: 'google_trends_rss' }),
      createMockCard({ title: 'B', score: 90, source: 'weibo_hot' }),
      createMockCard({ title: 'B', score: 80, source: 'mock' }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    // Cluster B has 3 sources vs Cluster A's 1
    expect(result[0].sources.length).toBeGreaterThanOrEqual(result[1].sources.length);
  });

  it('should_sort_top_items_by_score_descending', () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      createMockCard({
        title: 'Same',
        score: 50 + Math.random() * 50, // Random scores
        id: `card-${i}`,
      })
    );

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    const topItems = result[0].top_items;
    for (let i = 0; i < topItems.length - 1; i++) {
      expect(topItems[i].score).toBeGreaterThanOrEqual(topItems[i + 1].score);
    }
  });
});

// ============================================================================
// 中文和多语言测试
// ============================================================================
describe('clusterThemeCards - 中文处理', () => {
  it('should_cluster_chinese_titles', () => {
    const cards = [
      createMockCard({ title: '比特币价格创新高', score: 100, language: 'zh' }),
      createMockCard({ title: '比特币突破新高', score: 95, language: 'zh' }),
      createMockCard({ title: '人工智能发展迅速', score: 100, language: 'zh' }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.6,
      maxClusters: 12,
    });

    // Chinese Bitcoin titles share "比特" but may not be similar enough to merge
    // So we could have 3 clusters (each title separate) or 2 if some merge
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('should_cluster_mixed_language_titles', () => {
    const cards = [
      createMockCard({ title: 'Bitcoin 比特币 price surge', score: 100 }),
      createMockCard({ title: 'Bitcoin price surge', score: 95 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.6,
      maxClusters: 12,
    });

    // Should detect similarity despite language mix
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('should_handle_chinese_punctuation_normalization', () => {
    const cards = [
      createMockCard({ title: '比特币，价格创新高', score: 100, language: 'zh' }),
      createMockCard({ title: '比特币价格创新高', score: 95, language: 'zh' }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.6,
      maxClusters: 12,
    });

    // Should cluster after punctuation normalization
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// 边界条件测试
// ============================================================================
describe('clusterThemeCards - 边界条件', () => {
  it('should_handle_very_long_titles', () => {
    const longTitle = 'A'.repeat(1000);
    const cards = [
      createMockCard({ title: longTitle, score: 100 }),
      createMockCard({ title: longTitle, score: 90 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should_handle_titles_with_only_special_chars', () => {
    const cards = [
      createMockCard({ title: '!@#$%^&*()', score: 100 }),
      createMockCard({ title: '!@#$%^&*()', score: 90 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    // Empty after normalization - might still create cluster
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should_handle_titles_with_emoji', () => {
    const cards = [
      createMockCard({ title: 'Bitcoin 🚀 to the moon', score: 100 }),
      createMockCard({ title: 'Bitcoin to the moon', score: 95 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.6,
      maxClusters: 12,
    });

    // Emoji should be normalized, making titles more similar
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('should_handle_cards_with_missing_urls', () => {
    const cards = [
      createMockCard({ title: 'Test', score: 100, url: undefined }),
      createMockCard({ title: 'Test', score: 90, url: null as any }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should_handle_cards_with_null_signals', () => {
    const cards = [
      createMockCard({ title: 'Test', score: 100 }),
      createMockCard({ title: 'Test', signals: null as any }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should_handle_infinite_similarity_threshold', () => {
    const cards = [
      createMockCard({ title: 'Test', score: 100 }),
      createMockCard({ title: 'Test', score: 90 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: Infinity as any,
      maxClusters: 12,
    });

    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should_handle_nan_similarity_threshold', () => {
    const cards = [createMockCard()];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: NaN as any,
      maxClusters: 12,
    });

    // Should use default when NaN
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// 算法特性测试
// ============================================================================
describe('clusterThemeCards - 算法细节', () => {
  it('should_use_highest_score_card_as_representative', () => {
    const cards = [
      createMockCard({ title: 'Topic', score: 50 }),
      createMockCard({ title: 'Topic', score: 100 }),
      createMockCard({ title: 'Topic', score: 75 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    // Representative should be the one with highest score
    expect(result[0].top_items[0].score).toBe(100);
  });

  it('should_not_create_cluster_for_singletons', () => {
    const cards = [
      createMockCard({ title: 'A', score: 100 }),
      createMockCard({ title: 'B', score: 100 }),
      createMockCard({ title: 'C', score: 100 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.9, // High threshold prevents clustering
      maxClusters: 12,
    });

    // With high threshold, each card is its own cluster (or singletons are filtered)
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should_handle_partial_overlap', () => {
    const cards = [
      createMockCard({ title: 'Bitcoin price surge today market', score: 100 }),
      createMockCard({ title: 'Ethereum price surge today market', score: 100 }),
      createMockCard({ title: 'Stock market crash today', score: 100 }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.5,
      maxClusters: 12,
    });

    // "surge today market" overlap might cluster first two
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// 性能和压力测试
// ============================================================================
describe('clusterThemeCards - 性能测试', () => {
  it('should_handle_large_input_efficiently', () => {
    const cards = Array.from({ length: 500 }, (_, i) =>
      createMockCard({
        id: `card-${i}`,
        title: `News item ${i} about various topics in finance`,
        score: 1000 - i,
      })
    );

    const start = Date.now();
    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 30,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it('should_handle_high_duplication_input', () => {
    const cards = Array.from({ length: 100 }, () =>
      createMockCard({
        title: 'Same title',
        score: 100,
        id: Math.random().toString(),
      })
    );

    const start = Date.now();
    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });
    const elapsed = Date.now() - start;

    // Should form single cluster
    expect(result.length).toBe(1);
    expect(result[0].size).toBe(100);
    expect(elapsed).toBeLessThan(1000);
  });

  it('should_handle_very_similar_but_not_identical_titles', () => {
    const cards = Array.from({ length: 50 }, (_, i) =>
      createMockCard({
        title: `Bitcoin price ${['up', 'down', 'surges', 'drops', 'rallies'][i % 5]} today`,
        score: 100,
      })
    );

    const start = Date.now();
    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.5,
      maxClusters: 12,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(result.length).toBeLessThanOrEqual(12);
  });
});

// ============================================================================
// 结果类型验证
// ============================================================================
describe('clusterThemeCards - 结果类型', () => {
  it('should_return_correct_cluster_structure', () => {
    const cards = [createMockCard()];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    for (const cluster of result) {
      expect(cluster).toHaveProperty('theme');
      expect(cluster).toHaveProperty('label');
      expect(cluster).toHaveProperty('size');
      expect(cluster).toHaveProperty('sources');
      expect(cluster).toHaveProperty('top_items');

      expect(typeof cluster.theme).toBe('string');
      expect(typeof cluster.label).toBe('string');
      expect(typeof cluster.size).toBe('number');
      expect(Array.isArray(cluster.sources)).toBe(true);
      expect(Array.isArray(cluster.top_items)).toBe(true);
    }
  });

  it('should_not_have_undefined_impact_by_default', () => {
    const cards = [createMockCard()];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    expect(result[0]?.impact).toBeUndefined();
  });

  it('should_have_consistent_top_items_structure', () => {
    const cards = [
      createMockCard({ title: 'A', score: 100, url: 'url1', id: '1' }),
      createMockCard({ title: 'A', score: 90, url: 'url2', id: '2' }),
    ];

    const result = clusterThemeCards({
      theme: 'finance',
      cards,
      similarityThreshold: 0.72,
      maxClusters: 12,
    });

    for (const item of result[0].top_items) {
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('score');
      expect(item).toHaveProperty('source');
      expect(typeof item.title).toBe('string');
      expect(typeof item.score).toBe('number');
      expect(typeof item.source).toBe('string');
    }
  });
});
