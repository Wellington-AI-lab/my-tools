/**
 * 高强度测试套件：trends/impact.test.ts
 * 覆盖模块：src/modules/trends/impact.ts
 * 目标覆盖率：≥98% 分支覆盖
 * 测试重点：影响评估算法、启发式分析、LLM 降级、边界条件
 * 生成时间：2025-12-28
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assessTrendEventImpact } from './impact';
import type { TrendEventCluster } from '../cluster';

// ============================================================================
// Mock LLM 客户端
// ============================================================================
vi.mock('../in-depth-analysis/llm/openai-compatible-client', () => ({
  openAICompatibleChatCompletion: vi.fn(),
}));

import { openAICompatibleChatCompletion } from '../in-depth-analysis/llm/openai-compatible-client';

// ============================================================================
// 测试数据构造器
// ============================================================================
function createMockCluster(overrides?: Partial<TrendEventCluster>): TrendEventCluster {
  return {
    theme: 'finance',
    label: 'Bitcoin price movement',
    size: 5,
    sources: ['google_trends_rss', 'weibo_hot'],
    top_items: [
      {
        title: 'Bitcoin reaches new high',
        source: 'google_trends_rss',
        score: 100,
        url: 'https://example.com',
      },
    ],
    ...overrides,
  };
}

// ============================================================================
// assessTrendEventImpact 测试
// ============================================================================
describe('assessTrendEventImpact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本功能', () => {
    it('should_return_empty_array_for_empty_input', async () => {
      const result = await assessTrendEventImpact({
        env: {},
        clusters: [],
      });

      expect(result).toEqual([]);
    });

    it('should_return_empty_array_for_null_input', async () => {
      const result = await assessTrendEventImpact({
        env: {},
        clusters: null as any,
      });

      expect(result).toEqual([]);
    });

    it('should_return_empty_array_for_undefined_input', async () => {
      const result = await assessTrendEventImpact({
        env: {},
        clusters: undefined as any,
      });

      expect(result).toEqual([]);
    });

    it('should_return_same_length_as_input', async () => {
      const clusters = [createMockCluster(), createMockCluster()];
      const result = await assessTrendEventImpact({
        env: {},
        clusters,
      });

      expect(result.length).toBe(2);
    });

    it('should_add_impact_property_to_clusters', async () => {
      const clusters = [createMockCluster()];
      const result = await assessTrendEventImpact({
        env: {},
        clusters,
      });

      expect(result[0].impact).toBeDefined();
      expect(result[0].impact).toHaveProperty('direction');
      expect(result[0].impact).toHaveProperty('confidence');
      expect(result[0].impact).toHaveProperty('rationale');
    });
  });

  describe('启发式分析 - 无 LLM', () => {
    describe('看跌信号检测', () => {
      it('should_detect_bearish_keywords', async () => {
        const cluster = createMockCluster({
          label: 'Stock market crash as recession fears rise',
          top_items: [
            { title: 'Market sell-off intensifies', source: 'test', score: 100 },
          ],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.direction).toBe('bearish');
      });

      it('should_detect_chinese_bearish_keywords', async () => {
        const cluster = createMockCluster({
          label: '股市暴跌，市场恐慌',
          top_items: [{ title: 'A股大跌', source: 'test', score: 100 }],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.direction).toBe('bearish');
      });

      it('should_calculate_higher_confidence_for_multiple_bearish_signals', async () => {
        const cluster = createMockCluster({
          label: 'Market crash selloff recession bankruptcy',
          top_items: [],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.direction).toBe('bearish');
        expect(result[0].impact?.confidence).toBeGreaterThan(0.55);
      });
    });

    describe('看涨信号检测', () => {
      it('should_detect_bullish_keywords', async () => {
        const cluster = createMockCluster({
          label: 'Stock market rally to record high',
          top_items: [
            { title: 'Market surge continues', source: 'test', score: 100 },
          ],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.direction).toBe('bullish');
      });

      it('should_detect_chinese_bullish_keywords', async () => {
        const cluster = createMockCluster({
          label: '股市大涨，突破新高',
          top_items: [{ title: 'A股反弹', source: 'test', score: 100 }],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.direction).toBe('bullish');
      });

      it('should_calculate_higher_confidence_for_multiple_bullish_signals', async () => {
        const cluster = createMockCluster({
          label: 'Record high surge partnership funding launch',
          top_items: [],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.direction).toBe('bullish');
        expect(result[0].impact?.confidence).toBeGreaterThan(0.55);
      });
    });

    describe('中性信号检测', () => {
      it('should_detect_neutral_keywords', async () => {
        const cluster = createMockCluster({
          label: 'Market rumor about upcoming trailer',
          top_items: [{ title: 'Product leak revealed', source: 'test', score: 100 }],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.direction).toBe('neutral');
      });

      it('should_detect_chinese_neutral_keywords', async () => {
        const cluster = createMockCluster({
          label: '传闻预告，路透消息',
          top_items: [],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.direction).toBe('neutral');
      });
    });

    describe('未知状态', () => {
      it('should_return_unknown_for_no_clear_signals', async () => {
        const cluster = createMockCluster({
          label: 'General market update today',
          top_items: [{ title: 'Regular news', source: 'test', score: 100 }],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.direction).toBe('unknown');
      });

      it('should_return_unknown_for_empty_label', async () => {
        const cluster = createMockCluster({
          label: '',
          top_items: [],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(['unknown', 'neutral']).toContain(result[0].impact?.direction);
      });
    });

    describe('信号平衡', () => {
      it('should_return_neutral_when_bullish_and_bearish_equal', async () => {
        const cluster = createMockCluster({
          label: 'Market rally and crash',
          top_items: [],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.direction).toBe('neutral');
      });

      it('should_prefer_bullish_when_slightly_more_signals', async () => {
        const cluster = createMockCluster({
          label: 'rally surge crash', // 2 bullish, 1 bearish
          top_items: [],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.direction).toBe('bullish');
      });
    });

    describe('置信度计算', () => {
      it('should_calculate_confidence_based_on_signal_difference', async () => {
        const cluster = createMockCluster({
          label: 'crash', // 1 signal
          top_items: [],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.confidence).toBeGreaterThan(0.5);
        expect(result[0].impact?.confidence).toBeLessThan(1.0);
      });

      it('should_clamp_confidence_between_0_55_and_0_85', async () => {
        const cluster = createMockCluster({
          label: 'crash crash crash crash crash', // Many signals
          top_items: [],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.confidence).toBeGreaterThanOrEqual(0.55);
        expect(result[0].impact?.confidence).toBeLessThanOrEqual(0.85);
      });

      it('should_use_0_45_confidence_for_neutral_with_keywords', async () => {
        const cluster = createMockCluster({
          label: 'rumor leak',
          top_items: [],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.confidence).toBe(0.45);
      });

      it('should_use_0_35_confidence_for_unknown', async () => {
        const cluster = createMockCluster({
          label: 'general news',
          top_items: [],
        });

        const result = await assessTrendEventImpact({
          env: {},
          clusters: [cluster],
        });

        expect(result[0].impact?.confidence).toBe(0.35);
      });
    });
  });

  describe('LLM 模式', () => {
    it('should_use_llm_when_configured', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([
          { idx: 0, direction: 'bullish', confidence: 0.75, rationale: '积极信号明显' },
        ])
      );

      const cluster = createMockCluster();
      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [cluster],
      });

      expect(result[0].impact?.direction).toBe('bullish');
      expect(result[0].impact?.confidence).toBe(0.75);
      expect(result[0].impact?.rationale).toBe('积极信号明显');
    });

    it('should_limit_clusters_sent_to_llm', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([])
      );

      const clusters = Array.from({ length: 20 }, (_, i) =>
        createMockCluster({ label: `Cluster ${i}` })
      );

      await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters,
      });

      const call = vi.mocked(openAICompatibleChatCompletion).mock.calls[0];
      const payload = call[0].messages[1].content;
      const data = JSON.parse(payload.split('Data:')[1]);

      // Should limit to 12 clusters
      expect(data.length).toBeLessThanOrEqual(12);
    });

    it('should_limit_top_items_to_3_per_cluster', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([])
      );

      const cluster = createMockCluster({
        top_items: Array.from({ length: 10 }, (_, i) => ({
          title: `Item ${i}`,
          source: 'test',
          score: 100 - i * 5,
          url: `url${i}`,
        })),
      });

      await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [cluster],
      });

      const call = vi.mocked(openAICompatibleChatCompletion).mock.calls[0];
      const payload = call[0].messages[1].content;
      const data = JSON.parse(payload.split('Data:')[1]);

      expect(data[0].top_items.length).toBeLessThanOrEqual(3);
    });

    it('should_include_cluster_metadata_in_prompt', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([])
      );

      const cluster = createMockCluster({
        theme: 'ai',
        label: 'AI model release',
        sources: ['google_trends_rss', 'weibo_hot', 'mock'],
        size: 10,
      });

      await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [cluster],
      });

      const call = vi.mocked(openAICompatibleChatCompletion).mock.calls[0];
      const payload = call[0].messages[1].content;

      expect(payload).toContain('ai');
      expect(payload).toContain('AI model release');
      expect(payload).toContain('google_trends_rss');
    });
  });

  describe('LLM 错误降级', () => {
    it('should_degrade_to_heuristic_on_llm_error', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockRejectedValueOnce(
        new Error('API timeout')
      );

      const cluster = createMockCluster();
      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [cluster],
      });

      expect(result[0].impact).toBeDefined();
    });

    it('should_degrade_to_heuristic_on_invalid_json', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        'invalid json response'
      );

      const cluster = createMockCluster();
      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [cluster],
      });

      expect(result[0].impact).toBeDefined();
    });

    it('should_degrade_to_heuristic_on_null_response', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(null as any);

      const cluster = createMockCluster();
      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [cluster],
      });

      expect(result[0].impact).toBeDefined();
    });
  });

  describe('LLM 响应解析', () => {
    it('should_parse_array_response', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([
          { idx: 0, direction: 'bullish', confidence: 0.8, rationale: 'Test' },
          { idx: 1, direction: 'bearish', confidence: 0.6, rationale: 'Test2' },
        ])
      );

      const clusters = [createMockCluster(), createMockCluster()];
      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters,
      });

      expect(result[0].impact?.direction).toBe('bullish');
      expect(result[1].impact?.direction).toBe('bearish');
    });

    it('should_extract_json_from_markdown', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        '```json\n[{"idx":0,"direction":"bullish","confidence":0.8,"rationale":"Test"}]\n```'
      );

      const cluster = createMockCluster();
      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [cluster],
      });

      expect(result[0].impact?.direction).toBe('bullish');
    });

    it('should_handle_missing_idx', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([
          { direction: 'bullish', confidence: 0.8, rationale: 'Test' },
        ])
      );

      const clusters = [createMockCluster()];
      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters,
      });

      // Should use heuristic for missing idx
      expect(result[0].impact).toBeDefined();
    });

    it('should_handle_invalid_direction', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([
          { idx: 0, direction: 'invalid' as any, confidence: 0.8, rationale: 'Test' },
        ])
      );

      const clusters = [createMockCluster()];
      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters,
      });

      expect(result[0].impact?.direction).toBe('unknown');
    });

    it('should_clamp_confidence_to_0_1', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([
          { idx: 0, direction: 'bullish', confidence: 1.5, rationale: 'Test' },
        ])
      );

      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [createMockCluster()],
      });

      expect(result[0].impact?.confidence).toBe(1);
    });

    it('should_limit_rationale_to_80_chars', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([
          { idx: 0, direction: 'bullish', confidence: 0.8, rationale: 'A'.repeat(100) },
        ])
      );

      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [createMockCluster()],
      });

      expect(result[0].impact?.rationale.length).toBeLessThanOrEqual(80);
    });

    it('should_handle_out_of_order_idx', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([
          { idx: 1, direction: 'bearish', confidence: 0.6, rationale: 'Test' },
          { idx: 0, direction: 'bullish', confidence: 0.8, rationale: 'Test' },
        ])
      );

      const clusters = [createMockCluster(), createMockCluster()];
      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters,
      });

      expect(result[0].impact?.direction).toBe('bullish');
      expect(result[1].impact?.direction).toBe('bearish');
    });
  });

  describe('多簇处理', () => {
    it('should_process_all_clusters', async () => {
      const clusters = [
        createMockCluster({ label: 'Bullish news rally' }),
        createMockCluster({ label: 'Bearish news crash' }),
        createMockCluster({ label: 'Neutral rumor leak' }),
      ];

      const result = await assessTrendEventImpact({
        env: {},
        clusters,
      });

      expect(result.length).toBe(3);
      expect(result[0].impact).toBeDefined();
      expect(result[1].impact).toBeDefined();
      expect(result[2].impact).toBeDefined();
    });

    it('should_handle_mixed_llm_and_heuristic', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([
          { idx: 0, direction: 'bullish', confidence: 0.8, rationale: 'LLM result' },
        ])
      );

      const clusters = [
        createMockCluster({ label: 'Test A' }),
        createMockCluster({ label: 'Test B' }),
      ];

      // First cluster gets LLM result, second gets heuristic
      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters,
      });

      expect(result.length).toBe(2);
      expect(result[0].impact?.rationale).toBe('LLM result');
      expect(result[1].impact).toBeDefined();
    });
  });

  describe('边界条件', () => {
    it('should_handle_empty_label', async () => {
      const cluster = createMockCluster({ label: '' });
      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      expect(result[0].impact).toBeDefined();
    });

    it('should_handle_null_label', async () => {
      const cluster = createMockCluster({ label: null as any });
      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      expect(result[0].impact).toBeDefined();
    });

    it('should_handle_undefined_top_items', async () => {
      const cluster = createMockCluster({ top_items: undefined as any });
      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      expect(result[0].impact).toBeDefined();
    });

    it('should_handle_empty_top_items', async () => {
      const cluster = createMockCluster({ top_items: [] });
      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      expect(result[0].impact).toBeDefined();
    });

    it('should_handle_top_items_with_null_title', async () => {
      const cluster = createMockCluster({
        top_items: [
          { title: null as any, source: 'test', score: 100 },
        ],
      });
      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      expect(result[0].impact).toBeDefined();
    });

    it('should_handle_very_long_label', async () => {
      const cluster = createMockCluster({
        label: 'A'.repeat(10000),
      });
      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      expect(result[0].impact).toBeDefined();
    });

    it('should_handle_special_characters_in_label', async () => {
      const cluster = createMockCluster({
        label: '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\n\t\r',
      });
      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      expect(result[0].impact).toBeDefined();
    });

    it('should_handle_infinite_confidence', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([
          { idx: 0, direction: 'bullish', confidence: Infinity, rationale: 'Test' },
        ])
      );

      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [createMockCluster()],
      });

      expect(result[0].impact?.confidence).toBe(0);
    });

    it('should_handle_nan_confidence', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([
          { idx: 0, direction: 'bullish', confidence: NaN, rationale: 'Test' },
        ])
      );

      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [createMockCluster()],
      });

      expect(result[0].impact?.confidence).toBe(0);
    });

    it('should_handle_negative_confidence', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify([
          { idx: 0, direction: 'bullish', confidence: -0.5, rationale: 'Test' },
        ])
      );

      const result = await assessTrendEventImpact({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        clusters: [createMockCluster()],
      });

      expect(result[0].impact?.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('结果结构', () => {
    it('should_preserve_original_cluster_properties', async () => {
      const cluster = createMockCluster({
        theme: 'ai',
        label: 'Test',
        size: 10,
        sources: ['google_trends_rss', 'weibo_hot'],
      });

      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      expect(result[0].theme).toBe('ai');
      expect(result[0].label).toBe('Test');
      expect(result[0].size).toBe(10);
      expect(result[0].sources).toEqual(['google_trends_rss', 'weibo_hot']);
    });

    it('should_add_impact_without_removing_properties', async () => {
      const cluster = createMockCluster();

      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      expect(Object.keys(result[0])).toContain('impact');
      expect(Object.keys(result[0])).toContain('theme');
      expect(Object.keys(result[0])).toContain('label');
      expect(Object.keys(result[0])).toContain('size');
    });

    it('should_have_valid_direction_values', async () => {
      const cluster = createMockCluster();
      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      const validDirections = ['bullish', 'bearish', 'neutral', 'unknown'];
      expect(validDirections).toContain(result[0].impact?.direction);
    });

    it('should_have_confidence_between_0_and_1', async () => {
      const cluster = createMockCluster();
      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      expect(result[0].impact?.confidence).toBeGreaterThanOrEqual(0);
      expect(result[0].impact?.confidence).toBeLessThanOrEqual(1);
    });

    it('should_have_string_rationale', async () => {
      const cluster = createMockCluster();
      const result = await assessTrendEventImpact({
        env: {},
        clusters: [cluster],
      });

      expect(typeof result[0].impact?.rationale).toBe('string');
    });
  });

  describe('性能测试', () => {
    it('should_handle_many_clusters_efficiently', async () => {
      const clusters = Array.from({ length: 100 }, (_, i) =>
        createMockCluster({ label: `Cluster ${i}` })
      );

      const start = Date.now();
      const result = await assessTrendEventImpact({
        env: {},
        clusters,
      });
      const elapsed = Date.now() - start;

      expect(result.length).toBe(100);
      expect(elapsed).toBeLessThan(500);
    });
  });
});
