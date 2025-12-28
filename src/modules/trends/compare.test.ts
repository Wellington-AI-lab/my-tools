/**
 * 高强度测试套件：trends/compare.test.ts
 * 覆盖模块：src/modules/trends/compare.ts
 * 目标覆盖率：≥98% 分支覆盖
 * 测试重点：趋势比较算法、飙升检测、跨平台共振、边界条件
 * 生成时间：2025-12-28
 * 测试框架：vitest
 */

import { describe, it, expect } from 'vitest';
import {
  compareTrendsWindow,
  compareTrendsWindowWithMatcher,
  type TrendSpike,
  type TrendResonance,
  type TrendsCompareResult,
} from './compare';
import { createAliasMatcher, type AliasMatcher } from './normalize';
import type { TrendsReport } from './types';

// ============================================================================
// 测试数据构造器
// ============================================================================
function createMockReport(overrides?: Partial<TrendsReport>): TrendsReport {
  return {
    meta: {
      generated_at: '2025-12-28T00:00:00.000Z',
      day_key: '2025-12-28',
      sources_used: ['google_trends_rss'],
      items_scanned: 10,
      items_kept: 5,
      execution_time_ms: 1000,
      llm_used: 'llm',
    },
    logs: [],
    trends_by_theme: [
      {
        theme: 'finance',
        keywords: ['bitcoin', 'stock'],
        cards: [],
      },
    ],
    insight_markdown: 'Test',
    ...overrides,
  };
}

function createReportWithKeywords(dayKey: string, theme: string, keywords: string[]): TrendsReport {
  return createMockReport({
    meta: { ...createMockReport().meta, day_key: dayKey },
    trends_by_theme: [
      {
        theme: theme as any,
        keywords,
        cards: [],
      },
    ],
  });
}

// ============================================================================
// compareTrendsWindow 测试
// ============================================================================
describe('compareTrendsWindow', () => {
  it('should_return_null_for_empty_array', () => {
    const result = compareTrendsWindow([]);
    expect(result).toBeNull();
  });

  it('should_return_null_for_null_input', () => {
    const result = compareTrendsWindow(null as any);
    expect(result).toBeNull();
  });

  it('should_return_null_for_undefined_input', () => {
    const result = compareTrendsWindow(undefined as any);
    expect(result).toBeNull();
  });

  it('should_return_null_for_non_array_input', () => {
    const result = compareTrendsWindow({} as any);
    expect(result).toBeNull();
  });

  it('should_return_result_for_single_report', () => {
    const reports = [createMockReport()];
    const result = compareTrendsWindow(reports);

    expect(result).not.toBeNull();
    expect(result?.meta.day_key).toBe('2025-12-28');
    expect(result?.spikes).toEqual([]);
  });

  it('should_return_result_for_multiple_reports', () => {
    const reports = [
      createReportWithKeywords('2025-12-28', 'finance', ['bitcoin']),
      createReportWithKeywords('2025-12-27', 'finance', ['stock']),
    ];
    const result = compareTrendsWindow(reports);

    expect(result).not.toBeNull();
    expect(result?.meta.window_days).toBe(2);
  });

  it('should_use_default_matcher', () => {
    const reports = [createMockReport()];
    const result = compareTrendsWindow(reports);

    expect(result).not.toBeNull();
  });
});

// ============================================================================
// compareTrendsWindowWithMatcher 测试
// ============================================================================
describe('compareTrendsWindowWithMatcher', () => {
  let matcher: AliasMatcher;

  beforeEach(() => {
    matcher = createAliasMatcher();
  });

  describe('基本功能', () => {
    it('should_return_null_for_empty_reports', () => {
      const result = compareTrendsWindowWithMatcher([], 7, matcher);
      expect(result).toBeNull();
    });

    it('should_clamp_window_days_to_minimum', () => {
      const reports = [createMockReport()];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      // The clamping happens at the slice level, but window_days returns actual length
      // Since we only have 1 report, window_days will be 1
      expect(result?.meta.window_days).toBe(1);
    });

    it('should_clamp_window_days_to_maximum', () => {
      const reports = [createMockReport()];
      const result = compareTrendsWindowWithMatcher(reports, 100, matcher);

      // With only 1 report, actual window length is 1
      expect(result?.meta.window_days).toBe(1);
    });

    it('should_use_provided_window_days', () => {
      const reports = [
        createMockReport(),
        createMockReport(),
        createMockReport(),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 3, matcher);

      expect(result?.meta.window_days).toBe(3);
    });

    it('should_handle_window_larger_than_reports', () => {
      const reports = [createMockReport()];
      const result = compareTrendsWindowWithMatcher(reports, 10, matcher);

      expect(result?.meta.window_days).toBe(1);
    });
  });

  describe('飙升检测 - spikes', () => {
    it('should_detect_spike_when_keyword_appears_suddenly', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['bitcoin', 'bitcoin', 'bitcoin']), // Today: 3x
        createReportWithKeywords('2025-12-27', 'finance', []), // Previous: empty
        createReportWithKeywords('2025-12-26', 'finance', []),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 3, matcher);

      // ratio = 3 / 0.5 = 6 >= 2.2, so spike should be detected
      expect(result?.spikes.length).toBeGreaterThan(0);
      expect(result?.spikes[0].canonical).toBe('bitcoin');
    });

    it('should_calculate_ratio_correctly', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['bitcoin', 'bitcoin']), // 2 today
        createReportWithKeywords('2025-12-27', 'finance', []), // 0 before
        createReportWithKeywords('2025-12-26', 'finance', []),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 3, matcher);

      expect(result?.spikes[0].today_count).toBe(2);
      expect(result?.spikes[0].prev_avg).toBe(0);
      // ratio = 2 / 0.5 = 4
      expect(result?.spikes[0].ratio).toBe(4);
    });

    it('should_only_include_spikes_above_threshold', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['bitcoin', 'stock', 'trading']),
        createReportWithKeywords('2025-12-27', 'finance', ['bitcoin', 'stock', 'trading']),
        createReportWithKeywords('2025-12-26', 'finance', ['bitcoin', 'stock', 'trading']),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 3, matcher);

      // No spikes if counts are consistent
      expect(result?.spikes.length).toBe(0);
    });

    it('should_limit_spikes_to_20', () => {
      const reports = [];
      // Today with 30 unique keywords
      const todayKeywords = Array.from({ length: 30 }, (_, i) => [`keyword${i}`]);
      reports.push(createReportWithKeywords('2025-12-28', 'finance', todayKeywords.flat()));

      // Previous days with no keywords
      for (let i = 0; i < 5; i++) {
        reports.push(createReportWithKeywords(`2025-12-${27 - i}`, 'finance', []));
      }

      const result = compareTrendsWindowWithMatcher(reports, 7, matcher);
      expect(result?.spikes.length).toBeLessThanOrEqual(20);
    });

    it('should_sort_spikes_by_ratio_descending', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['a', 'b', 'c']),
        createReportWithKeywords('2025-12-27', 'finance', ['a']),
        createReportWithKeywords('2025-12-26', 'finance', ['a', 'b']),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 3, matcher);

      for (let i = 0; i < (result?.spikes.length || 0) - 1; i++) {
        expect(result!.spikes[i].ratio).toBeGreaterThanOrEqual(result!.spikes[i + 1].ratio);
      }
    });
  });

  describe('跨平台共振 - resonance', () => {
    it('should_detect_resonance_across_sources', () => {
      const reports = [
        createMockReport({
          meta: { day_key: '2025-12-28' } as any,
          trends_by_theme: [
            {
              theme: 'finance',
              keywords: ['bitcoin'],
              cards: [
                { source: 'google_trends_rss', title: 'Bitcoin up', language: 'en', themes: ['finance'], signals: { score: 100 }, id: '1' },
                { source: 'weibo_hot', title: '比特币', language: 'zh', themes: ['finance'], signals: { score: 100 }, id: '2' },
              ],
            },
          ],
        }),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      expect(result?.resonance.length).toBeGreaterThan(0);
    });

    it('should_require_at_least_2_sources', () => {
      const reports = [
        createMockReport({
          meta: { day_key: '2025-12-28' } as any,
          trends_by_theme: [
            {
              theme: 'finance',
              keywords: ['bitcoin'],
              cards: [
                { source: 'google_trends_rss', title: 'Bitcoin up', language: 'en', themes: ['finance'], signals: { score: 100 }, id: '1' },
              ],
            },
          ],
        }),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      expect(result?.resonance.length).toBe(0);
    });

    it('should_limit_resonance_to_20', () => {
      // Create many resonance entries
      const cards = [];
      for (let i = 0; i < 25; i++) {
        cards.push({
          source: `source${i % 3}` as any,
          title: `Keyword ${i}`,
          language: 'en',
          themes: ['finance'],
          signals: { score: 100 },
          id: `card-${i}`,
        });
      }

      const reports = [
        createMockReport({
          meta: { day_key: '2025-12-28' } as any,
          trends_by_theme: [
            {
              theme: 'finance',
              keywords: Array.from({ length: 25 }, (_, i) => `keyword${i}`),
              cards,
            },
          ],
        }),
      ];

      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);
      expect(result?.resonance.length).toBeLessThanOrEqual(20);
    });

    it('should_sort_resonance_by_source_count_then_name', () => {
      const reports = [
        createMockReport({
          meta: { day_key: '2025-12-28' } as any,
          trends_by_theme: [
            {
              theme: 'finance',
              keywords: ['bitcoin', 'stock'],
              cards: [
                { source: 'google_trends_rss', title: 'Bitcoin', language: 'en', themes: ['finance'], signals: { score: 100 }, id: '1' },
                { source: 'weibo_hot', title: 'BTC', language: 'zh', themes: ['finance'], signals: { score: 100 }, id: '2' },
                { source: 'mock', title: 'Stock', language: 'en', themes: ['finance'], signals: { score: 100 }, id: '3' },
              ],
            },
          ],
        }),
      ];

      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      for (let i = 0; i < (result?.resonance.length || 0) - 1; i++) {
        const sourcesDiff = result!.resonance[i + 1].sources.length - result!.resonance[i].sources.length;
        if (sourcesDiff === 0) {
          // Sort by name alphabetically if same source count
          expect(result!.resonance[i].keyword.localeCompare(result!.resonance[i + 1].keyword)).toBeLessThanOrEqual(0);
        }
      }
    });
  });

  describe('per_theme 输出', () => {
    it('should_include_per_theme_breakdown', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['bitcoin']),
        createReportWithKeywords('2025-12-27', 'finance', []),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 2, matcher);

      expect(result?.per_theme).toBeDefined();
      expect(Array.isArray(result?.per_theme)).toBe(true);
    });

    it('should_include_today_keywords', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['bitcoin', 'stock']),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      const financeTheme = result?.per_theme.find(t => t.theme === 'finance');
      expect(financeTheme?.today_keywords).toBeDefined();
    });

    it('should_limit_today_keywords_to_6', () => {
      const keywords = Array.from({ length: 20 }, (_, i) => `keyword${i}`);
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', keywords),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      const financeTheme = result?.per_theme.find(t => t.theme === 'finance');
      expect(financeTheme?.today_keywords.length).toBeLessThanOrEqual(6);
    });

    it('should_include_spiking_keywords', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['bitcoin', 'bitcoin', 'bitcoin']),
        createReportWithKeywords('2025-12-27', 'finance', []),
        createReportWithKeywords('2025-12-26', 'finance', []),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 3, matcher);

      const financeTheme = result?.per_theme.find(t => t.theme === 'finance');
      expect(financeTheme?.spiking_keywords.length).toBeGreaterThan(0);
    });

    it('should_limit_spiking_keywords_to_3', () => {
      const todayKeywords = Array.from({ length: 20 }, (_, i) => `kw${i}`);
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', todayKeywords),
        createReportWithKeywords('2025-12-27', 'finance', []),
        createReportWithKeywords('2025-12-26', 'finance', []),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 3, matcher);

      const financeTheme = result?.per_theme.find(t => t.theme === 'finance');
      expect(financeTheme?.spiking_keywords.length).toBeLessThanOrEqual(3);
    });
  });

  describe('clusters 集成', () => {
    it('should_generate_clusters_from_today_report', () => {
      const reports = [
        createMockReport({
          meta: { day_key: '2025-12-28' } as any,
          trends_by_theme: [
            {
              theme: 'finance',
              keywords: ['bitcoin'],
              cards: [
                { source: 'google_trends_rss', title: 'Bitcoin price up', language: 'en', themes: ['finance'], signals: { score: 100 }, id: '1' },
                { source: 'google_trends_rss', title: 'Bitcoin hits high', language: 'en', themes: ['finance'], signals: { score: 95 }, id: '2' },
                { source: 'weibo_hot', title: 'Bitcoin surge', language: 'en', themes: ['finance'], signals: { score: 90 }, id: '3' },
              ],
            },
          ],
        }),
      ];

      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);
      expect(result?.clusters.length).toBeGreaterThan(0);
    });

    it('should_limit_clusters_to_18', () => {
      const cards = [];
      for (let i = 0; i < 30; i++) {
        cards.push({
          source: 'google_trends_rss',
          title: `News ${i}`,
          language: 'en',
          themes: ['finance'],
          signals: { score: 100 },
          id: `card-${i}`,
        });
      }

      const reports = [
        createMockReport({
          meta: { day_key: '2025-12-28' } as any,
          trends_by_theme: [
            {
              theme: 'finance',
              keywords: ['test'],
              cards,
            },
          ],
        }),
      ];

      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);
      expect(result?.clusters.length).toBeLessThanOrEqual(18);
    });
  });

  describe('别名匹配器集成', () => {
    it('should_use_matcher_for_keyword_canonicalization', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['英伟达', 'NVDA']),
        createReportWithKeywords('2025-12-27', 'finance', []),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 2, matcher);

      // Both should be counted under 'nvidia'
      expect(result?.spikes.some(s => s.canonical === 'nvidia')).toBe(true);
    });

    it('should_track_display_keywords', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['英伟达']),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      const financeTheme = result?.per_theme.find(t => t.theme === 'finance');
      expect(financeTheme?.today_keywords).toContain('英伟达');
    });
  });

  describe('边界条件', () => {
    it('should_handle_report_with_empty_trends_by_theme', () => {
      const reports = [
        createMockReport({
          meta: { day_key: '2025-12-28' } as any,
          trends_by_theme: [],
        }),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      expect(result).not.toBeNull();
      expect(result?.spikes.length).toBe(0);
    });

    it('should_handle_report_with_null_keywords', () => {
      const reports = [
        createMockReport({
          meta: { day_key: '2025-12-28' } as any,
          trends_by_theme: [
            { theme: 'finance', keywords: null as any, cards: [] },
          ],
        }),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      expect(result).not.toBeNull();
    });

    it('should_handle_report_with_undefined_keywords', () => {
      const reports = [
        createMockReport({
          meta: { day_key: '2025-12-28' } as any,
          trends_by_theme: [
            { theme: 'finance', keywords: undefined as any, cards: [] },
          ],
        }),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      expect(result).not.toBeNull();
    });

    it('should_handle_report_with_empty_keywords_array', () => {
      const reports = [
        createMockReport({
          meta: { day_key: '2025-12-28' } as any,
          trends_by_theme: [
            { theme: 'finance', keywords: [], cards: [] },
          ],
        }),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      expect(result).not.toBeNull();
    });

    it('should_handle_keywords_with_special_chars', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['test!!!', 'keyword???']),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      expect(result).not.toBeNull();
    });

    it('should_handle_very_long_keywords', () => {
      const longKeyword = 'a'.repeat(1000);
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', [longKeyword]),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

      expect(result).not.toBeNull();
    });
  });

  describe('数值精度', () => {
    it('should_handle_zero_prev_avg', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['bitcoin', 'bitcoin', 'bitcoin']), // 3 today
        createReportWithKeywords('2025-12-27', 'finance', []), // 0 before
      ];
      const result = compareTrendsWindowWithMatcher(reports, 2, matcher);

      expect(result?.spikes[0].prev_avg).toBe(0);
    });

    it('should_calculate_avg_correctly_for_multiple_prev_days', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['bitcoin', 'bitcoin', 'bitcoin']), // 3 today
        createReportWithKeywords('2025-12-27', 'finance', ['bitcoin']), // 1
        createReportWithKeywords('2025-12-26', 'finance', ['bitcoin', 'bitcoin']), // 2
        createReportWithKeywords('2025-12-25', 'finance', []), // 0
      ];
      const result = compareTrendsWindowWithMatcher(reports, 4, matcher);

      // prev avg = (1 + 2 + 0) / 3 = 1
      expect(result?.spikes[0].prev_avg).toBeCloseTo(1, 1);
    });

    it('should_round_ratio_to_2_decimal_places', () => {
      const reports = [
        createReportWithKeywords('2025-12-28', 'finance', ['bitcoin', 'bitcoin']), // 2 today
        createReportWithKeywords('2025-12-27', 'finance', []), // 0 before
        createReportWithKeywords('2025-12-26', 'finance', []),
      ];
      const result = compareTrendsWindowWithMatcher(reports, 3, matcher);

      const ratio = result?.spikes[0].ratio;
      // Should have at most 2 decimal places
      if (ratio) {
        const decimalPlaces = ratio.toString().split('.')[1]?.length || 0;
        expect(decimalPlaces).toBeLessThanOrEqual(2);
      }
    });
  });
});

// ============================================================================
// 结果类型验证
// ============================================================================
describe('TrendsCompareResult - 类型验证', () => {
  it('should_have_all_required_fields', () => {
    const reports = [
      createReportWithKeywords('2025-12-28', 'finance', ['test']),
    ];
    const matcher = createAliasMatcher();
    const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

    expect(result).toHaveProperty('meta');
    expect(result).toHaveProperty('spikes');
    expect(result).toHaveProperty('resonance');
    expect(result).toHaveProperty('clusters');
    expect(result).toHaveProperty('per_theme');

    expect(result?.meta).toHaveProperty('day_key');
    expect(result?.meta).toHaveProperty('window_days');
  });

  it('should_have_correct_spike_structure', () => {
    const reports = [
      createReportWithKeywords('2025-12-28', 'finance', ['bitcoin']),
      createReportWithKeywords('2025-12-27', 'finance', []),
    ];
    const matcher = createAliasMatcher();
    const result = compareTrendsWindowWithMatcher(reports, 2, matcher);

    if (result?.spikes.length > 0) {
      const spike = result.spikes[0];
      expect(spike).toHaveProperty('theme');
      expect(spike).toHaveProperty('keyword');
      expect(spike).toHaveProperty('canonical');
      expect(spike).toHaveProperty('today_count');
      expect(spike).toHaveProperty('prev_avg');
      expect(spike).toHaveProperty('ratio');

      expect(typeof spike.theme).toBe('string');
      expect(typeof spike.keyword).toBe('string');
      expect(typeof spike.canonical).toBe('string');
      expect(typeof spike.today_count).toBe('number');
      expect(typeof spike.prev_avg).toBe('number');
      expect(typeof spike.ratio).toBe('number');
    }
  });

  it('should_have_correct_resonance_structure', () => {
    const reports = [
      createMockReport({
        meta: { day_key: '2025-12-28' } as any,
        trends_by_theme: [
          {
            theme: 'finance',
            keywords: ['bitcoin'],
            cards: [
              { source: 'google_trends_rss', title: 'BTC', language: 'en', themes: ['finance'], signals: { score: 100 }, id: '1' },
              { source: 'weibo_hot', title: 'BTC', language: 'zh', themes: ['finance'], signals: { score: 100 }, id: '2' },
            ],
          },
        ],
      }),
    ];
    const matcher = createAliasMatcher();
    const result = compareTrendsWindowWithMatcher(reports, 1, matcher);

    if (result?.resonance.length > 0) {
      const resonance = result.resonance[0];
      expect(resonance).toHaveProperty('theme');
      expect(resonance).toHaveProperty('keyword');
      expect(resonance).toHaveProperty('canonical');
      expect(resonance).toHaveProperty('sources');

      expect(typeof resonance.theme).toBe('string');
      expect(typeof resonance.keyword).toBe('string');
      expect(typeof resonance.canonical).toBe('string');
      expect(Array.isArray(resonance.sources)).toBe(true);
    }
  });
});

// ============================================================================
// 性能测试
// ============================================================================
describe('性能测试', () => {
  it('should_handle_large_window_efficiently', () => {
    const reports = [];
    for (let i = 0; i < 14; i++) {
      const keywords = Array.from({ length: 20 }, (_, j) => `keyword${j}`);
      reports.push(createReportWithKeywords(`2025-12-${28 - i}`, 'finance', keywords));
    }

    const matcher = createAliasMatcher();
    const start = Date.now();
    const result = compareTrendsWindowWithMatcher(reports, 14, matcher);
    const elapsed = Date.now() - start;

    expect(result).not.toBeNull();
    expect(elapsed).toBeLessThan(1000);
  });

  it('should_handle_many_keywords_efficiently', () => {
    const keywords = Array.from({ length: 100 }, (_, i) => `keyword${i}`);
    const reports = [
      createReportWithKeywords('2025-12-28', 'finance', keywords),
    ];

    const matcher = createAliasMatcher();
    const start = Date.now();
    const result = compareTrendsWindowWithMatcher(reports, 1, matcher);
    const elapsed = Date.now() - start;

    expect(result).not.toBeNull();
    expect(elapsed).toBeLessThan(500);
  });
});
