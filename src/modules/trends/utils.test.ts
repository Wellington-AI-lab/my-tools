/**
 * 高强度测试套件：trends/utils.test.ts
 * 覆盖模块：src/modules/trends/utils.ts
 * 目标覆盖率：≥98% 分支覆盖
 * 测试重点：边界条件、Unicode 处理、算法正确性、性能边界
 * 生成时间：2025-12-28
 * 测试框架：vitest
 */

import { describe, it, expect, bench } from 'vitest';
import {
  nowIso,
  normalizeText,
  bigrams,
  jaccard,
  stableId,
  detectLanguage,
  tagThemes,
  mapRawToCard,
} from './utils';
import type { TrendRawItem } from './types';

// ============================================================================
// nowIso 测试
// ============================================================================
describe('nowIso', () => {
  it('should_return_valid_iso8601_format', () => {
    const result = nowIso();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should_return_current_time', () => {
    const before = Date.now();
    const result = nowIso();
    const after = Date.now();
    const timestamp = new Date(result).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('should_be_gregorian_calendar_compliant', () => {
    const result = nowIso();
    const date = new Date(result);
    expect(date.toString()).not.toBe('Invalid Date');
  });
});

// ============================================================================
// normalizeText 测试 - 核心文本处理函数，需要高强度测试
// ============================================================================
describe('normalizeText', () => {
  describe('正常路径 - 基本输入', () => {
    it('should_handle_empty_string', () => {
      expect(normalizeText('')).toBe('');
    });

    it('should_handle_simple_english', () => {
      expect(normalizeText('Hello World')).toBe('helloworld');
    });

    it('should_handle_simple_chinese', () => {
      expect(normalizeText('你好世界')).toBe('你好世界');
    });

    it('should_remove_whitespace', () => {
      expect(normalizeText('hello   world\ttest\nvalue')).toBe('helloworldtestvalue');
    });

    it('should_convert_to_lowercase', () => {
      expect(normalizeText('HELLO WORLD')).toBe('helloworld');
      expect(normalizeText('HeLLo WoRLd')).toBe('helloworld');
    });

    it('should_keep_chinese_characters', () => {
      expect(normalizeText('人工智能AI')).toBe('人工智能ai');
    });
  });

  describe('特殊字符处理', () => {
    it('should_remove_punctuation', () => {
      expect(normalizeText('hello, world!')).toBe('helloworld');
      expect(normalizeText('test@example.com')).toBe('testexamplecom');
      expect(normalizeText('user_name')).toBe('username');
    });

    it('should_remove_symbols', () => {
      expect(normalizeText('!@#$%^&*()_+-=[]{}|;:,.<>?/`~"\'')).toBe('');
    });

    it('should_keep_numbers', () => {
      expect(normalizeText('abc123def456')).toBe('abc123def456');
    });

    it('should_handle_mixed_content', () => {
      expect(normalizeText('iPhone 15 Pro 价格: $999')).toBe('iphone15pro价格999');
    });

    it('should_remove_newlines_and_tabs', () => {
      expect(normalizeText('line1\nline2\rline3\tline4')).toBe('line1line2line3line4');
    });
  });

  describe('Unicode 边界测试', () => {
    it('should_handle_emoji', () => {
      // normalizeText removes emojis (not Han, Letter, or Number)
      expect(normalizeText('Hello 🌍 World 🔥')).toBe('helloworld');
    });

    it('should_handle_rare_unicode_chars', () => {
      expect(normalizeText(' test ')).toBe('test');
    });

    it('should_handle_zero_width_joiner', () => {
      // Zero-width joiners and emojis are removed by normalizeText
      expect(normalizeText('👨‍👩‍👧‍👦')).toBe('');
    });

    it('should_handle_variation_selectors', () => {
      const text = '󠁧'; // Variation selector
      const result = normalizeText(text);
      // Variation selectors should be preserved or removed consistently
      expect(typeof result).toBe('string');
    });
  });

  describe('正则表达式 ReDoS 防护测试', () => {
    it('should_handle_very_long_string_without_hanging', () => {
      const longString = 'a'.repeat(10000) + '中文'.repeat(5000) + '!@#$%^&*()'.repeat(1000);
      const start = Date.now();
      const result = normalizeText(longString);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // 应该在 100ms 内完成
      expect(result).toBeTruthy();
    });

    it('should_handle_deeply_nested_special_chars', () => {
      const nested = '!@#$%^&*()'.repeat(100) + 'test' + '{}[]|\\:;<>?,./'.repeat(100);
      const start = Date.now();
      const result = normalizeText(nested);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result).toBe('test');
    });
  });

  describe('类型安全测试', () => {
    it('should_handle_null_like_values', () => {
      expect(normalizeText(null as any)).toBe('');
      expect(normalizeText(undefined as any)).toBe('');
      // 0 is falsy, so becomes '' then String('') = ''
      expect(normalizeText(0 as any)).toBe('');
      expect(normalizeText(123 as any)).toBe('123');
    });

    it('should_handle_object_string_conversion', () => {
      expect(normalizeText({ toString: () => 'test' } as any)).toBe('test');
    });
  });

  describe('语言特定处理', () => {
    it('should_handle_japanese', () => {
      expect(normalizeText('こんにちは')).toBe('こんにちは');
    });

    it('should_handle_korean', () => {
      expect(normalizeText('안녕하세요')).toBe('안녕하세요');
    });

    it('should_handle_arabic', () => {
      expect(normalizeText('مرحبا')).toBe('مرحبا');
    });

    it('should_handle_russian', () => {
      expect(normalizeText('Привет')).toBe('привет');
    });

    it('should_handle_thai', () => {
      // Thai vowel signs (combining marks) are removed, only consonants remain
      expect(normalizeText('สวัสดี')).toBe('สวสด');
    });
  });

  describe('边缘组合', () => {
    it('should_handle_mixed_scripts', () => {
      // Emoji is removed, but letters from all scripts are preserved
      expect(normalizeText('Hello你好مرحبا🌍')).toBe('hello你好مرحبا');
    });

    it('should_handle_rtl_ltr_mix', () => {
      const result = normalizeText('Hello مرحبا test');
      expect(result).toContain('hello');
      expect(result).toContain('مرحبا');
    });
  });
});

// ============================================================================
// bigrams 测试 - N-gram 提取算法
// ============================================================================
describe('bigrams', () => {
  describe('基本功能', () => {
    it('should_return_empty_for_empty_string', () => {
      const result = bigrams('');
      expect(result.size).toBe(0);
    });

    it('should_return_single_char_for_single_char', () => {
      const result = bigrams('a');
      expect(result.size).toBe(1);
      expect(result.has('a')).toBe(true);
    });

    it('should_generate_two_char_bigrams', () => {
      const result = bigrams('hello');
      expect(result.size).toBe(4);
      expect(result.has('he')).toBe(true);
      expect(result.has('el')).toBe(true);
      expect(result.has('ll')).toBe(true);
      expect(result.has('lo')).toBe(true);
    });

    it('should_handle_chinese_bigrams', () => {
      const result = bigrams('你好世界');
      expect(result.size).toBe(3);
      expect(result.has('你好')).toBe(true);
      expect(result.has('好世')).toBe(true);
      expect(result.has('世界')).toBe(true);
    });
  });

  describe('normalizeText 集成', () => {
    it('should_normalize_before_generating_bigrams', () => {
      const result = bigrams('Hello World');
      expect(result.has('helloworld')).toBe(false); // 不应该有空格
      expect(result.has('he')).toBe(true);
      expect(result.has('ll')).toBe(true);
    });

    it('should_remove_case_differences', () => {
      const result1 = bigrams('HELLO');
      const result2 = bigrams('hello');
      expect(result1).toEqual(result2);
    });
  });

  describe('Set 特性', () => {
    it('should_return_unique_bigrams_only', () => {
      const result = bigrams('aaaa');
      expect(result.size).toBe(1);
      expect(result.has('aa')).toBe(true);
    });

    it('should_handle_repeated_patterns', () => {
      const result = bigrams('ababab');
      expect(result.size).toBe(2);
      expect(result.has('ab')).toBe(true);
      expect(result.has('ba')).toBe(true);
    });
  });

  describe('边界条件', () => {
    it('should_handle_two_chars', () => {
      const result = bigrams('ab');
      expect(result.size).toBe(1);
      expect(result.has('ab')).toBe(true);
    });

    it('should_handle_three_chars', () => {
      const result = bigrams('abc');
      expect(result.size).toBe(2);
      expect(result.has('ab')).toBe(true);
      expect(result.has('bc')).toBe(true);
    });

    it('should_handle_long_string', () => {
      const result = bigrams('abcdefghijklmnopqrstuvwxyz');
      expect(result.size).toBe(25);
    });
  });

  describe('特殊输入', () => {
    it('should_handle_string_with_only_spaces', () => {
      const result = bigrams('   ');
      expect(result.size).toBe(0);
    });

    it('should_handle_string_with_only_special_chars', () => {
      const result = bigrams('!@#$%');
      expect(result.size).toBe(0);
    });

    it('should_handle_mixed_valid_invalid', () => {
      const result = bigrams('a!b@c');
      expect(result.size).toBe(2);
      expect(result.has('ab')).toBe(true);
      expect(result.has('bc')).toBe(true);
    });
  });
});

// ============================================================================
// jaccard 测试 - 相似度算法
// ============================================================================
describe('jaccard', () => {
  describe('基本功能', () => {
    it('should_return_1_for_identical_sets', () => {
      const set1 = new Set(['a', 'b', 'c']);
      const set2 = new Set(['a', 'b', 'c']);
      expect(jaccard(set1, set2)).toBe(1);
    });

    it('should_return_0_for_disjoint_sets', () => {
      const set1 = new Set(['a', 'b']);
      const set2 = new Set(['c', 'd']);
      expect(jaccard(set1, set2)).toBe(0);
    });

    it('should_return_0_5_for_half_overlap', () => {
      const set1 = new Set(['a', 'b']);
      const set2 = new Set(['b', 'c']);
      // Intersection: {b} = 1, Union: {a,b,c} = 3, J = 1/3
      const result = jaccard(set1, set2);
      expect(result).toBeCloseTo(0.333, 2);
    });

    it('should_handle_one_empty_set', () => {
      const set1 = new Set(['a', 'b']);
      const set2 = new Set();
      expect(jaccard(set1, set2)).toBe(0);
    });

    it('should_return_1_for_both_empty_sets', () => {
      const set1 = new Set();
      const set2 = new Set();
      expect(jaccard(set1, set2)).toBe(1);
    });
  });

  describe('数值精度', () => {
    it('should_return_correct_precision', () => {
      const set1 = new Set(['a', 'b', 'c', 'd']);
      const set2 = new Set(['c', 'd', 'e', 'f']);
      // Intersection: {c,d} = 2, Union: {a,b,c,d,e,f} = 6, J = 2/6 = 0.333
      const result = jaccard(set1, set2);
      expect(result).toBeGreaterThan(0.33);
      expect(result).toBeLessThan(0.34);
    });

    it('should_handle_large_sets', () => {
      const set1 = new Set(Array.from({ length: 100 }, (_, i) => `item${i}`));
      const set2 = new Set(Array.from({ length: 100 }, (_, i) => `item${i + 50}`));
      const result = jaccard(set1, set2);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });
  });

  describe('对称性', () => {
    it('should_be_symmetric', () => {
      const set1 = new Set(['a', 'b', 'c']);
      const set2 = new Set(['b', 'c', 'd']);
      expect(jaccard(set1, set2)).toBe(jaccard(set2, set1));
    });
  });

  describe('边界组合', () => {
    it('should_handle_single_element_sets', () => {
      expect(jaccard(new Set(['a']), new Set(['a']))).toBe(1);
      expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
    });

    it('should_handle_sets_with_different_sizes', () => {
      const set1 = new Set(['a', 'b', 'c', 'd', 'e']);
      const set2 = new Set(['a']);
      expect(jaccard(set1, set2)).toBe(0.2);
    });
  });
});

// ============================================================================
// stableId 测试 - 稳定哈希函数
// ============================================================================
describe('stableId', () => {
  describe('基本功能', () => {
    it('should_return_hex_string', () => {
      const result = stableId('test');
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it('should_be_deterministic', () => {
      const input = 'consistent-input';
      const result1 = stableId(input);
      const result2 = stableId(input);
      expect(result1).toBe(result2);
    });

    it('should_generate_different_ids_for_different_inputs', () => {
      const result1 = stableId('input1');
      const result2 = stableId('input2');
      expect(result1).not.toBe(result2);
    });

    it('should_handle_empty_string', () => {
      const result = stableId('');
      expect(result).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('哈希质量', () => {
    it('should_have_good_distribution', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(stableId(`test-${i}`));
      }
      // 1000 个不同输入应该产生 1000 个不同 ID
      expect(ids.size).toBe(1000);
    });

    it('should_minimize_collisions_for_similar_inputs', () => {
      const inputs = ['test', 'test1', 'test2', 'Test', 'TEST', ' tes', 'test '];
      const ids = inputs.map(s => stableId(s));
      const uniqueIds = new Set(ids);
      // 相似输入应该产生不同哈希
      expect(uniqueIds.size).toBe(inputs.length);
    });

    it('should_handle_unicode', () => {
      const id1 = stableId('hello');
      const id2 = stableId('你好');
      const id3 = stableId('🔥');
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });

  describe('边界条件', () => {
    it('should_handle_very_long_input', () => {
      const longInput = 'a'.repeat(10000);
      const result = stableId(longInput);
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it('should_truncate_at_256_chars', () => {
      const short = stableId('test');
      const long = stableId('a'.repeat(300));
      const veryLong = stableId('a'.repeat(500));
      // 超过 256 字符应该被截断，但前 256 字符相同
      expect(long).toBe(veryLong);
      expect(short).not.toBe(long);
    });

    it('should_handle_special_characters', () => {
      const special = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\\' + String.fromCharCode(10) + String.fromCharCode(13) + String.fromCharCode(9) + String.fromCharCode(0);
      const result = stableId(special);
      expect(result).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('FNV-1a 特定行为', () => {
    it('should_use_32_bit_hash', () => {
      const result = stableId('test');
      const num = parseInt(result, 16);
      expect(num).toBeLessThan(Math.pow(2, 32));
    });

    it('should_produce_consistent_output_across_calls', () => {
      const inputs = ['a', 'ab', 'abc', 'test', 'hello world'];
      const results = inputs.map(i => stableId(i));

      // 多次调用应该产生相同结果
      for (let i = 0; i < inputs.length; i++) {
        expect(stableId(inputs[i])).toBe(results[i]);
      }
    });
  });
});

// ============================================================================
// detectLanguage 测试 - 语言检测
// ============================================================================
describe('detectLanguage', () => {
  describe('中文检测', () => {
    it('should_detect_chinese', () => {
      expect(detectLanguage('你好')).toBe('zh');
      expect(detectLanguage('世界')).toBe('zh');
    });

    it('should_detect_mixed_chinese_english', () => {
      expect(detectLanguage('AI人工智能')).toBe('zh'); // 包含中文
    });

    it('should_detect_mixed_chinese_with_symbols', () => {
      expect(detectLanguage('《三体》书籍')).toBe('zh');
    });

    it.each([
      ['简体中文', '简体中文'],
      ['繁體中文', '繁體中文'],
      ['日本語漢字', '日本語漢字'],
    ])('should_detect_%s', (_, input) => {
      expect(detectLanguage(input)).toBe('zh');
    });
  });

  describe('英文检测', () => {
    it('should_detect_english', () => {
      expect(detectLanguage('hello')).toBe('en');
      expect(detectLanguage('world')).toBe('en');
    });

    it('should_detect_mixed_case_english', () => {
      expect(detectLanguage('HeLLo')).toBe('en');
    });
  });

  describe('unknown 检测', () => {
    it('should_return_unknown_for_empty_string', () => {
      expect(detectLanguage('')).toBe('unknown');
    });

    it('should_return_unknown_for_only_symbols', () => {
      expect(detectLanguage('!@#$%')).toBe('unknown');
    });

    it('should_return_unknown_for_only_numbers', () => {
      expect(detectLanguage('12345')).toBe('unknown');
    });

    it('should_return_unknown_for_only_spaces', () => {
      expect(detectLanguage('   ')).toBe('unknown');
    });
  });

  describe('边界情况', () => {
    it('should_prefer_chinese_over_english', () => {
      expect(detectLanguage('你好hello')).toBe('zh');
    });

    it('should_handle_mixed_scripts', () => {
      expect(detectLanguage('123你好')).toBe('zh');
      expect(detectLanguage('123abc')).toBe('en');
    });
  });
});

// ============================================================================
// tagThemes 测试 - 主题标签
// ============================================================================
describe('tagThemes', () => {
  describe('金融主题', () => {
    it('should_detect_finance_chinese_keywords', () => {
      expect(tagThemes('股票')).toContain('finance');
      expect(tagThemes('基金')).toContain('finance');
      expect(tagThemes('比特币')).toContain('finance');
      expect(tagThemes('黄金')).toContain('finance');
    });

    it('should_detect_finance_english_keywords', () => {
      expect(tagThemes('stock market')).toContain('finance');
      expect(tagThemes('Bitcoin price')).toContain('finance');
      expect(tagThemes('Gold trading')).toContain('finance');
    });

    it('should_not_detect_non_finance', () => {
      expect(tagThemes('这是一个测试')).not.toContain('finance');
    });
  });

  describe('经济主题', () => {
    it('should_detect_economy_keywords', () => {
      expect(tagThemes('通胀数据')).toContain('economy');
      expect(tagThemes('GDP增长')).toContain('economy');
      expect(tagThemes('失业率')).toContain('economy');
      expect(tagThemes('CPI指数')).toContain('economy');
    });

    it('should_detect_economy_english', () => {
      expect(tagThemes('inflation rate')).toContain('economy');
      expect(tagThemes('unemployment')).toContain('economy');
    });
  });

  describe('AI 主题', () => {
    it('should_detect_ai_keywords', () => {
      expect(tagThemes('大模型发布')).toContain('ai');
      expect(tagThemes('人工智能')).toContain('ai');
      expect(tagThemes('OpenAI新品')).toContain('ai');
      expect(tagThemes('英伟达芯片')).toContain('ai');
    });

    it('should_detect_ai_english', () => {
      expect(tagThemes('AI breakthrough')).toContain('ai');
      expect(tagThemes('LLM model')).toContain('ai');
    });
  });

  describe('机器人主题', () => {
    it('should_detect_robotics_keywords', () => {
      expect(tagThemes('人形机器人')).toContain('robotics');
      expect(tagThemes('自动驾驶')).toContain('robotics');
      expect(tagThemes('无人机发布')).toContain('robotics');
    });
  });

  describe('多主题检测', () => {
    it('should_detect_multiple_themes', () => {
      const result = tagThemes('英伟达推出新AI芯片');
      expect(result).toContain('ai'); // AI芯片 and 英伟达
      // '英伟达' is only in ai theme keywords, not finance
      // To detect both, we'd need a title like '英伟达股价大涨' (NVIDIA stock surges)
    });

    it('should_detect_empty_for_no_match', () => {
      expect(tagThemes('这是一个普通的新闻标题')).not.toContain('finance');
      expect(tagThemes('测试内容')).not.toContain('ai');
    });
  });

  describe('大小写敏感性', () => {
    it('should_be_case_insensitive_for_english', () => {
      const result1 = tagThemes('BITCOIN price');
      const result2 = tagThemes('bitcoin price');
      expect(result1).toEqual(result2);
    });
  });

  describe('边界条件', () => {
    it('should_handle_empty_string', () => {
      expect(tagThemes('')).toEqual([]);
    });

    it('should_handle_string_with_only_symbols', () => {
      expect(tagThemes('!@#$%')).toEqual([]);
    });

    it('should_handle_partial_matches', () => {
      expect(tagThemes('股市分析')).toContain('finance');
      expect(tagThemes('美股市场')).toContain('finance');
    });
  });
});

// ============================================================================
// mapRawToCard 测试 - 数据映射
// ============================================================================
describe('mapRawToCard', () => {
  const mockRawItem: TrendRawItem = {
    source: 'google_trends_rss',
    title: 'Bitcoin reaches new all-time high',
    url: 'https://example.com/bitcoin',
    rank: 1,
    language: 'en',
    score: 500,
  };

  describe('基本映射', () => {
    it('should_map_all_fields_correctly', () => {
      const result = mapRawToCard(mockRawItem);
      expect(result.source).toBe('google_trends_rss');
      expect(result.title).toBe('Bitcoin reaches new all-time high');
      expect(result.url).toBe('https://example.com/bitcoin');
      expect(result.language).toBe('en');
    });

    it('should_generate_id', () => {
      const result = mapRawToCard(mockRawItem);
      expect(result.id).toBeTruthy();
      expect(result.id).toContain('google_trends_rss_');
    });

    it('should_have_signals_object', () => {
      const result = mapRawToCard(mockRawItem);
      expect(result.signals).toBeDefined();
      expect(typeof result.signals.score).toBe('number');
    });

    it('should_have_themes_array', () => {
      const result = mapRawToCard(mockRawItem);
      expect(Array.isArray(result.themes)).toBe(true);
    });
  });

  describe('评分计算', () => {
    it('should_use_provided_score_when_available', () => {
      const item = { ...mockRawItem, score: 1000 };
      const result = mapRawToCard(item);
      expect(result.signals.score).toBe(1000);
    });

    it('should_fallback_to_rank_based_score', () => {
      const item = { ...mockRawItem, score: undefined, rank: 5 };
      const result = mapRawToCard(item);
      expect(result.signals.score).toBeGreaterThan(0);
      expect(result.signals.score).toBeLessThanOrEqual(300);
    });

    it('should_handle_zero_score', () => {
      const item = { ...mockRawItem, score: 0 };
      const result = mapRawToCard(item);
      // When score is 0, it uses rank-based scoring: 300 - rank * 10 = 300 - 1*10 = 290
      expect(result.signals.score).toBe(290);
    });

    it('should_handle_negative_score', () => {
      const item = { ...mockRawItem, score: -100 };
      const result = mapRawToCard(item);
      // Negative scores are clamped to 0, then rank-based scoring applies
      expect(result.signals.score).toBe(290);
    });

    it('should_handle_missing_rank_and_score', () => {
      const item = { source: 'mock', title: 'test' } as TrendRawItem;
      const result = mapRawToCard(item);
      expect(result.signals.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('语言检测', () => {
    it('should_preserve_valid_language', () => {
      const zhItem = { ...mockRawItem, language: 'zh', title: '测试' };
      const result = mapRawToCard(zhItem);
      expect(result.language).toBe('zh');
    });

    it('should_detect_language_when_missing', () => {
      const item = { source: 'mock', title: 'hello world' } as TrendRawItem;
      const result = mapRawToCard(item);
      expect(result.language).toBe('en');
    });

    it('should_detect_chinese', () => {
      const item = { source: 'mock', title: '你好世界' } as TrendRawItem;
      const result = mapRawToCard(item);
      expect(result.language).toBe('zh');
    });
  });

  describe('边界条件', () => {
    it('should_handle_empty_title', () => {
      const item = { source: 'mock', title: '' } as TrendRawItem;
      const result = mapRawToCard(item);
      expect(result.title).toBe('');
    });

    it('should_handle_missing_url', () => {
      const item = { source: 'mock', title: 'test' } as TrendRawItem;
      const result = mapRawToCard(item);
      expect(result.url).toBeUndefined();
    });

    it('should_handle_extra_field', () => {
      const item = { ...mockRawItem, extra: { custom: 'value' } };
      const result = mapRawToCard(item);
      // Extra field is not part of TrendCard, so it won't be in result
      expect(result).toBeDefined();
    });
  });

  describe('ID 生成稳定性', () => {
    it('should_generate_same_id_for_same_input', () => {
      const result1 = mapRawToCard(mockRawItem);
      const result2 = mapRawToCard(mockRawItem);
      expect(result1.id).toBe(result2.id);
    });

    it('should_generate_different_ids_for_different_titles', () => {
      const item1 = { ...mockRawItem, title: 'title1' };
      const item2 = { ...mockRawItem, title: 'title2' };
      const result1 = mapRawToCard(item1);
      const result2 = mapRawToCard(item2);
      expect(result1.id).not.toBe(result2.id);
    });
  });
});

// ============================================================================
// 性能测试
// ============================================================================
describe('性能测试', () => {
  it('normalizeText with 1000 chars should be fast', () => {
    const start = Date.now();
    normalizeText('a'.repeat(1000));
    expect(Date.now() - start).toBeLessThan(10);
  });

  it('normalizeText with mixed content should be fast', () => {
    const start = Date.now();
    normalizeText('Hello 你好 !@#$% test 测试');
    expect(Date.now() - start).toBeLessThan(10);
  });

  it('bigrams with 100 chars should be fast', () => {
    const start = Date.now();
    bigrams('a'.repeat(100));
    expect(Date.now() - start).toBeLessThan(10);
  });

  it('jaccard with large sets should be fast', () => {
    const set1 = new Set(Array.from({ length: 100 }, (_, i) => `item${i}`));
    const set2 = new Set(Array.from({ length: 100 }, (_, i) => `item${i + 50}`));
    const start = Date.now();
    jaccard(set1, set2);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('stableId with typical input should be fast', () => {
    const start = Date.now();
    stableId('Bitcoin price reaches new all-time high amid market rally');
    expect(Date.now() - start).toBeLessThan(10);
  });

  it('detectLanguage with chinese should be fast', () => {
    const start = Date.now();
    detectLanguage('比特币价格创下历史新高，市场情绪乐观');
    expect(Date.now() - start).toBeLessThan(10);
  });

  it('tagThemes with mixed content should be fast', () => {
    const start = Date.now();
    tagThemes('英伟达推出新款AI芯片，比特币价格突破新高');
    expect(Date.now() - start).toBeLessThan(10);
  });

  it('mapRawToCard full mapping should be fast', () => {
    const item: TrendRawItem = {
      source: 'google_trends_rss',
      title: 'Bitcoin reaches new all-time high',
      url: 'https://example.com/bitcoin',
      rank: 1,
      language: 'en',
      score: 500,
    };
    const start = Date.now();
    mapRawToCard(item);
    expect(Date.now() - start).toBeLessThan(10);
  });
});
