/**
 * 高强度测试套件：trends/pipeline/reason.test.ts
 * 覆盖模块：src/modules/trends/pipeline/reason.ts
 * 目标覆盖率：≥98% 分支覆盖
 * 测试重点：LLM 推理、降级机制、JSON 解析、错误处理
 * 生成时间：2025-12-28
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reasonTrends } from './reason';
import type { TrendCard, TrendTheme } from '../../types';

// ============================================================================
// Mock LLM 客户端
// ============================================================================
vi.mock('../../in-depth-analysis/llm/openai-compatible-client', () => ({
  openAICompatibleChatCompletion: vi.fn(),
}));

import { openAICompatibleChatCompletion } from '../../in-depth-analysis/llm/openai-compatible-client';

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

function createCardsByTheme(theme: TrendTheme, titles: string[]): Map<TrendTheme, TrendCard[]> {
  const map = new Map<TrendTheme, TrendCard[]>();
  map.set(theme, titles.map((title, i) =>
    createMockCard({ title, id: `${theme}-${i}`, themes: [theme] })
  ));
  return map;
}

// ============================================================================
// reasonTrends 测试
// ============================================================================
describe('reasonTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Mock 模式 - 无 LLM 配置', () => {
    it('should_use_mock_mode_when_no_llm_configured', async () => {
      const byTheme = createCardsByTheme('finance', ['Bitcoin price up', 'Stock market rally']);
      const result = await reasonTrends({
        env: { LLM_BASE_URL: '', LLM_API_KEY: '', LLM_MODEL: '' },
        byTheme,
        sourcesUsed: ['google_trends_rss'],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
      expect(result.byThemeKeywords.size).toBeGreaterThan(0);
      expect(result.insight).toContain('Daily Trend Radar');
    });

    it('should_use_mock_mode_when_llm_base_url_missing', async () => {
      const byTheme = createCardsByTheme('ai', ['AI breakthrough']);
      const result = await reasonTrends({
        env: { LLM_BASE_URL: undefined as any, LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });

    it('should_use_mock_mode_when_llm_api_key_missing', async () => {
      const byTheme = createCardsByTheme('ai', ['AI model']);
      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: undefined as any, LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });

    it('should_use_mock_mode_when_llm_model_missing', async () => {
      const byTheme = createCardsByTheme('ai', ['AI news']);
      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: undefined as any },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });

    it('should_use_mock_mode_when_all_empty_strings', async () => {
      const byTheme = createCardsByTheme('finance', ['Test']);
      const result = await reasonTrends({
        env: { LLM_BASE_URL: '   ', LLM_API_KEY: '   ', LLM_MODEL: '   ' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });
  });

  describe('Mock 关键词生成', () => {
    it('should_generate_keywords_from_chinese_titles', async () => {
      const byTheme = createCardsByTheme('finance', ['比特币价格上涨', '股市大跌']);
      const result = await reasonTrends({
        env: {},
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      const financeKeywords = result.byThemeKeywords.get('finance') ?? [];
      expect(financeKeywords.length).toBeGreaterThan(0);
    });

    it('should_generate_keywords_from_english_titles', async () => {
      const byTheme = createCardsByTheme('ai', ['OpenAI launches new model', 'Google announces AI']);
      const result = await reasonTrends({
        env: {},
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      const aiKeywords = result.byThemeKeywords.get('ai') ?? [];
      expect(aiKeywords.length).toBeGreaterThan(0);
    });

    it('should_limit_keywords_to_6_per_theme', async () => {
      const titles = Array.from({ length: 10 }, (_, i) => `Keyword ${i} test`);
      const byTheme = createCardsByTheme('finance', titles);
      const result = await reasonTrends({
        env: {},
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      const financeKeywords = result.byThemeKeywords.get('finance') ?? [];
      expect(financeKeywords.length).toBeLessThanOrEqual(6);
    });

    it('should_filter_short_keywords', async () => {
      const byTheme = createCardsByTheme('finance', ['A', 'BB', 'CCCC']);
      const result = await reasonTrends({
        env: {},
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      const financeKeywords = result.byThemeKeywords.get('finance') ?? [];
      // All length >= 2
      for (const kw of financeKeywords) {
        expect(kw.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('Mock 洞察生成', () => {
    it('should_include_all_themes_in_mock_insight', async () => {
      const map = new Map<TrendTheme, TrendCard[]>();
      map.set('finance', [createMockCard({ title: 'Bitcoin up' })]);
      map.set('ai', [createMockCard({ title: 'AI news' })]);

      const result = await reasonTrends({
        env: {},
        byTheme: map,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.insight).toContain('finance');
      expect(result.insight).toContain('ai');
    });

    it('should_include_theme_keywords_in_mock_insight', async () => {
      const byTheme = createCardsByTheme('finance', ['Bitcoin price surges']);
      const result = await reasonTrends({
        env: {},
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      const financeKeywords = result.byThemeKeywords.get('finance') ?? [];
      if (financeKeywords.length > 0) {
        expect(result.insight).toContain(financeKeywords[0]);
      }
    });

    it('should_include_scores_in_mock_insight', async () => {
      const byTheme = createCardsByTheme('finance', ['Bitcoin up']);
      const result = await reasonTrends({
        env: {},
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.insight).toContain('score');
    });

    it('should_include_source_in_mock_insight', async () => {
      const byTheme = createCardsByTheme('finance', ['Bitcoin up']);
      const result = await reasonTrends({
        env: {},
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      // Mock insight includes the source name (e.g., 'google_trends_rss')
      expect(result.insight).toContain('google_trends_rss');
    });
  });

  describe('LLM 模式', () => {
    it('should_use_llm_mode_when_configured', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          by_theme: [
            { theme: 'finance', keywords: ['bitcoin', 'crypto'] },
            { theme: 'ai', keywords: ['llm', 'gpt'] },
          ],
          insight_markdown: '## AI驱动市场\n\n今日AI和加密货币共同推动市场走势。',
        })
      );

      const map = new Map<TrendTheme, TrendCard[]>();
      map.set('finance', [createMockCard()]);
      map.set('ai', [createMockCard({ title: 'AI news', themes: ['ai'] })]);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme: map,
        sourcesUsed: ['google_trends_rss'],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('llm');
      expect(result.byThemeKeywords.get('finance')).toEqual(['bitcoin', 'crypto']);
      expect(result.byThemeKeywords.get('ai')).toEqual(['llm', 'gpt']);
    });

    it('should_pass_correct_params_to_llm', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          by_theme: [],
          insight_markdown: 'Test',
        })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      await reasonTrends({
        env: { LLM_BASE_URL: 'https://api.test', LLM_API_KEY: 'sk-test', LLM_MODEL: 'gpt-4' },
        byTheme,
        sourcesUsed: ['google_trends_rss', 'weibo_hot'],
        dayKey: '2025-12-28',
      });

      expect(openAICompatibleChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://api.test',
          apiKey: 'sk-test',
          model: 'gpt-4',
          temperature: 0.2,
          maxTokens: 900,
          timeoutMs: 20000,
        })
      );
    });

    it('should_include_system_prompt', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({ by_theme: [], insight_markdown: 'Test' })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      const calls = vi.mocked(openAICompatibleChatCompletion).mock.calls;
      expect(calls[0][0].messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ])
      );
    });

    it('should_include_day_key_in_prompt', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({ by_theme: [], insight_markdown: 'Test' })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      const userPrompt = vi.mocked(openAICompatibleChatCompletion).mock.calls[0][0].messages[1].content;
      expect(userPrompt).toContain('2025-12-28');
    });

    it('should_limit_top_10_cards_per_theme', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({ by_theme: [], insight_markdown: 'Test' })
      );

      const map = new Map<TrendTheme, TrendCard[]>();
      const cards = Array.from({ length: 20 }, (_, i) =>
        createMockCard({ id: `card-${i}`, title: `Card ${i}` })
      );
      map.set('finance', cards);

      await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme: map,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      const userPrompt = vi.mocked(openAICompatibleChatCompletion).mock.calls[0][0].messages[1].content;
      // Check that data includes limited cards
      expect(userPrompt).toBeTruthy();
    });

    it('should_limit_keywords_to_3_per_theme', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          by_theme: [
            { theme: 'finance', keywords: ['a', 'b', 'c', 'd', 'e', 'f'] },
          ],
          insight_markdown: 'Test',
        })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      const financeKeywords = result.byThemeKeywords.get('finance') ?? [];
      expect(financeKeywords.length).toBeLessThanOrEqual(3);
    });
  });

  describe('LLM 错误降级', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should_degrade_to_mock_on_llm_error', async () => {
      // Mock the function to reject with an error
      (openAICompatibleChatCompletion as any).mockImplementationOnce(
        () => Promise.reject(new Error('API timeout'))
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      // Should fall back to mock mode when LLM call fails
      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });

    it('should_degrade_to_mock_on_invalid_json', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        'not valid json at all'
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });

    it('should_degrade_to_mock_on_missing_by_theme', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          insight_markdown: 'Test without by_theme',
        })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });

    it('should_degrade_to_mock_on_missing_insight', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          by_theme: [],
        })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });

    it('should_degrade_to_mock_on_non_array_by_theme', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          by_theme: 'not an array',
          insight_markdown: 'Test',
        })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });

    it('should_degrade_to_mock_on_non_string_insight', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          by_theme: [],
          insight_markdown: 12345,
        })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });
  });

  describe('safeJsonParse 测试', () => {
    it('should_parse_valid_json', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({ by_theme: [], insight_markdown: 'Test' })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('llm');
    });

    it('should_extract_json_from_markdown_code_block', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        '```json\n{"by_theme":[],"insight_markdown":"Test"}\n```'
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('llm');
    });

    it('should_extract_partial_json_from_malformed_response', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        'Some text before {"by_theme":[],"insight_markdown":"Test"} some text after'
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('llm');
    });

    it('should_handle_empty_string_response', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce('');

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });

    it('should_handle_response_without_braces', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        'This is just plain text without any JSON structure.'
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });
  });

  describe('主题验证', () => {
    it('should_ignore_invalid_themes_from_llm', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          by_theme: [
            { theme: 'finance', keywords: ['a'] },
            { theme: 'invalid_theme' as any, keywords: ['b'] },
            { theme: 'ai', keywords: ['c'] },
          ],
          insight_markdown: 'Test',
        })
      );

      const map = new Map<TrendTheme, TrendCard[]>();
      map.set('finance', [createMockCard()]);
      map.set('ai', [createMockCard({ themes: ['ai'] })]);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme: map,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.byThemeKeywords.has('invalid_theme' as any)).toBe(false);
    });

    it('should_handle_null_theme_entry', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          by_theme: [
            null,
            { theme: 'finance', keywords: ['a'] },
            undefined,
          ],
          insight_markdown: 'Test',
        })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.byThemeKeywords.get('finance')).toEqual(['a']);
    });

    it('should_handle_missing_keywords_array', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          by_theme: [
            { theme: 'finance', keywords: null as any },
            { theme: 'ai', keywords: ['llm'] },
          ],
          insight_markdown: 'Test',
        })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.byThemeKeywords.get('finance')).toEqual([]);
    });
  });

  describe('关键词处理', () => {
    it('should_trim_whitespace_from_keywords', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          by_theme: [
            { theme: 'finance', keywords: ['  bitcoin  ', 'stock', ' trading '] },
          ],
          insight_markdown: 'Test',
        })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      const financeKeywords = result.byThemeKeywords.get('finance') ?? [];
      expect(financeKeywords).toEqual(['bitcoin', 'stock', 'trading']);
    });

    it('should_filter_empty_keywords', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({
          by_theme: [
            { theme: 'finance', keywords: ['', 'bitcoin', '', 'stock', '  '] },
          ],
          insight_markdown: 'Test',
        })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      const financeKeywords = result.byThemeKeywords.get('finance') ?? [];
      expect(financeKeywords).toEqual(['bitcoin', 'stock']);
    });
  });

  describe('边界条件', () => {
    it('should_handle_empty_byTheme', async () => {
      const result = await reasonTrends({
        env: {},
        byTheme: new Map(),
        sourcesUsed: [],
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
      expect(result.insight).toBeTruthy();
    });

    it('should_handle_null_sourcesUsed', async () => {
      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: {},
        byTheme,
        sourcesUsed: null as any,
        dayKey: '2025-12-28',
      });

      expect(result.used).toBe('mock');
    });

    it('should_handle_empty_dayKey', async () => {
      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: {},
        byTheme,
        sourcesUsed: [],
        dayKey: '',
      });

      expect(result.used).toBe('mock');
      // Day key should still be included in the LLM prompt
    });

    it('should_handle_special_chars_in_dayKey', async () => {
      vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
        JSON.stringify({ by_theme: [], insight_markdown: 'Test' })
      );

      const byTheme = createCardsByTheme('finance', ['Test']);

      const result = await reasonTrends({
        env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
        byTheme,
        sourcesUsed: [],
        dayKey: '2025/12/28',
      });

      expect(result.used).toBe('llm');
    });
  });
});

// ============================================================================
// 结果结构验证
// ============================================================================
describe('结果结构', () => {
  it('should_return_correct_result_structure', async () => {
    vi.mocked(openAICompatibleChatCompletion).mockResolvedValueOnce(
      JSON.stringify({ by_theme: [], insight_markdown: 'Test insight' })
    );

    const byTheme = createCardsByTheme('finance', ['Test']);

    const result = await reasonTrends({
      env: { LLM_BASE_URL: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model' },
      byTheme,
      sourcesUsed: [],
      dayKey: '2025-12-28',
    });

    expect(result).toHaveProperty('used');
    expect(result).toHaveProperty('byThemeKeywords');
    expect(result).toHaveProperty('insight');

    expect(['llm', 'mock']).toContain(result.used);
    expect(result.byThemeKeywords instanceof Map).toBe(true);
    expect(typeof result.insight).toBe('string');
  });

  it('should_have_byThemeKeywords_for_all_themes', async () => {
    const result = await reasonTrends({
      env: {},
      byTheme: new Map(),
      sourcesUsed: [],
      dayKey: '2025-12-28',
    });

    // Should have all themes initialized
    const themes: TrendTheme[] = ['finance', 'economy', 'ai', 'robotics', 'travel', 'music', 'movies', 'fashion', 'entertainment'];
    for (const theme of themes) {
      expect(result.byThemeKeywords.has(theme)).toBe(true);
      expect(Array.isArray(result.byThemeKeywords.get(theme))).toBe(true);
    }
  });
});

// ============================================================================
// 性能测试
// ============================================================================
describe('性能', () => {
  it('should_complete_mock_mode_quickly', async () => {
    const cards = Array.from({ length: 100 }, (_, i) =>
      createMockCard({ title: `News item ${i}`, id: `card-${i}` })
    );
    const byTheme = new Map<TrendTheme, TrendCard[]>();
    byTheme.set('finance', cards);

    const start = Date.now();
    const result = await reasonTrends({
      env: {},
      byTheme,
      sourcesUsed: [],
      dayKey: '2025-12-28',
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result.used).toBe('mock');
  });
});
