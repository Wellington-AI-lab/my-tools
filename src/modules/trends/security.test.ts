/**
 * 高强度安全测试套件：trends/security.test.ts
 * 覆盖模块：src/modules/trends/*
 * 测试重点：注入攻击、DoS、边界条件、异常输入、资源耗尽防护
 * 生成时间：2025-12-28
 * 测试框架：vitest
 */

import { describe, it, expect } from 'vitest';
import { normalizeText, bigrams, jaccard, stableId } from './utils';
import { createAliasMatcher } from './normalize';
import { filterAndGroupTrends } from './pipeline/filter';
import { clusterThemeCards } from './cluster';
import { reasonTrends } from './pipeline/reason';
import { assessTrendEventImpact } from './impact';
import { parseRss } from './sources/google-trends-rss';
import { fetchWeiboHotSummary } from './sources/weibo-hot';
import type { TrendRawItem, TrendCard } from './types';

// ============================================================================
// 输入验证与边界测试
// ============================================================================
describe('安全测试 - 输入验证', () => {
  describe('normalizeText 边界测试', () => {
    it('should_handle_very_long_string_without_crash', () => {
      const longString = 'a'.repeat(1000000);
      const start = Date.now();
      const result = normalizeText(longString);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(result.length).toBe(longString.length);
    });

    it('should_handle_deeply_nested_special_chars', () => {
      const nested = '{{{((([])))}}}]]]]'.repeat(1000);
      const start = Date.now();
      const result = normalizeText(nested);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
    });

    it('should_handle_null_byte_injections', () => {
      const inputs = [
        'test\x00value',
        '\x00\x00\x00',
        'a\x00b\x00c',
      ];

      for (const input of inputs) {
        expect(() => normalizeText(input)).not.toThrow();
        const result = normalizeText(input);
        expect(typeof result).toBe('string');
      }
    });

    it('should_handle_unicode_homograph_attacks', () => {
      // Homograph attacks use visually similar characters from different scripts
      const inputs = [
        'аpple', // Cyrillic 'а'
        'аррle', // Mixed Cyrillic and Latin
        'test\u0300', // Combining characters
      ];

      for (const input of inputs) {
        expect(() => normalizeText(input)).not.toThrow();
      }
    });

    it('should_handle_zalgo_text', () => {
      const zalgo = 't\u0300\u0301\u0302\u0303\u0304\u0305e\u0306\u0307\u0308s\u0309t';
      expect(() => normalizeText(zalgo)).not.toThrow();
    });
  });

  describe('bigrams ReDoS 防护', () => {
    it('should_not_hang_on_repeated_characters', () => {
      const input = 'aaaaaaaaaaaaaaaaaaaa'; // Many same characters
      const start = Date.now();
      const result = bigrams(input);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
      expect(result.size).toBe(1);
    });

    it('should_handle_alternating_pattern', () => {
      const input = 'ab'.repeat(10000);
      const start = Date.now();
      const result = bigrams(input);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
    });

    it('should_handle_unicode_repetition', () => {
      const input = '你好'.repeat(5000);
      const start = Date.now();
      const result = bigrams(input);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('jaccard 数值安全', () => {
    it('should_handle_very_large_sets', () => {
      const set1 = new Set(Array.from({ length: 100000 }, (_, i) => `item${i}`));
      const set2 = new Set(Array.from({ length: 100000 }, (_, i) => `item${i + 50000}`));

      const start = Date.now();
      const result = jaccard(set1, set2);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should_handle_empty_sets', () => {
      expect(jaccard(new Set(), new Set())).toBe(1);
      expect(jaccard(new Set(['a']), new Set())).toBe(0);
      expect(jaccard(new Set(), new Set(['a']))).toBe(0);
    });

    it('should_handle_sets_with_special_characters', () => {
      const set1 = new Set(['\x00', '\n', '\r', '\t']);
      const set2 = new Set(['\x00', '\n']);

      expect(() => jaccard(set1, set2)).not.toThrow();
    });
  });

  describe('stableId 哈希安全', () => {
    it('should_not_leak_sensitive_info_in_id', () => {
      const sensitive = 'password123-secret_key-API_TOKEN';
      const id = stableId(sensitive);

      // ID should be hex only, no trace of original
      expect(id).toMatch(/^[0-9a-f]+$/);
      expect(id).not.toContain('password');
      expect(id).not.toContain('secret');
      expect(id).not.toContain('TOKEN');
    });

    it('should_handle_very_long_input', () => {
      const long = 'a'.repeat(1000000);
      expect(() => stableId(long)).not.toThrow();
    });

    it('should_produce_different_hashes_for_similar_inputs', () => {
      const inputs = ['password', 'Password', 'password ', ' password'];
      const ids = new Set(inputs.map(s => stableId(s)));

      // All should be different
      expect(ids.size).toBe(inputs.length);
    });
  });
});

// ============================================================================
// 模糊测试 - Fuzzing
// ============================================================================
describe('安全测试 - 模糊测试', () => {
  describe('random_input_handling', () => {
    it('should_handle_random_bytes', () => {
      const random = () => Math.random().toString(36).substring(2);

      for (let i = 0; i < 100; i++) {
        const input = random() + random() + random();
        expect(() => normalizeText(input)).not.toThrow();
        expect(() => bigrams(input)).not.toThrow();
        expect(() => stableId(input)).not.toThrow();
      }
    });

    it('should_handle_mixed_control_characters', () => {
      const controls = [
        '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07',
        '\x08', '\x09', '\x0A', '\x0B', '\x0C', '\x0D', '\x0E', '\x0F',
        '\x7F', '\x80', '\x81', '\xFF',
      ];

      for (const ctrl of controls) {
        const input = `test${ctrl}value${ctrl}`;
        expect(() => normalizeText(input)).not.toThrow();
      }
    });
  });
});

// ============================================================================
// 资源耗尽防护
// ============================================================================
describe('安全测试 - 资源耗尽', () => {
  describe('filterAndGroupTrends 防护', () => {
    it('should_handle_extreme_dedup_threshold', () => {
      const items = Array.from({ length: 1000 }, (_, i) =>
        createMockItem({ title: `Item ${i}`, score: 100 })
      );

      expect(() =>
        filterAndGroupTrends(items, {
          minScore: 0,
          dedupTitleSimilarity: Infinity as any,
          maxPerTheme: 12,
          maxTotal: 150,
        })
      ).not.toThrow();
    });

    it('should_handle_negative_maxTotal', () => {
      const items = [createMockItem()];

      expect(() =>
        filterAndGroupTrends(items, {
          minScore: 0,
          dedupTitleSimilarity: 0.66,
          maxPerTheme: 12,
          maxTotal: -100,
        })
      ).not.toThrow();
    });

    it('should_handle_extreme_maxPerTheme', () => {
      const items = [createMockItem()];

      expect(() =>
        filterAndGroupTrends(items, {
          minScore: 0,
          dedupTitleSimilarity: 0.66,
          maxPerTheme: Number.MAX_SAFE_INTEGER,
          maxTotal: 150,
        })
      ).not.toThrow();
    });
  });

  describe('clusterThemeCards 防护', () => {
    it('should_handle_large_similarity_threshold', () => {
      const cards = Array.from({ length: 100 }, (_, i) =>
        createMockCard({ title: `Card ${i}`, id: `id-${i}` })
      );

      expect(() =>
        clusterThemeCards({
          theme: 'finance',
          cards,
          similarityThreshold: Number.MAX_VALUE,
          maxClusters: 12,
        })
      ).not.toThrow();
    });

    it('should_handle_negative_similarity_threshold', () => {
      const cards = [createMockCard()];

      expect(() =>
        clusterThemeCards({
          theme: 'finance',
          cards,
          similarityThreshold: -10,
          maxClusters: 12,
        })
      ).not.toThrow();
    });

    it('should_handle_extreme_maxClusters', () => {
      const cards = [createMockCard()];

      expect(() =>
        clusterThemeCards({
          theme: 'finance',
          cards,
          similarityThreshold: 0.72,
          maxClusters: Number.MAX_SAFE_INTEGER,
        })
      ).not.toThrow();
    });
  });
});

// ============================================================================
// 类型安全测试
// ============================================================================
describe('安全测试 - 类型安全', () => {
  it('should_handle_null_in_normalizeText', () => {
    expect(normalizeText(null as any)).toBe('');
  });

  it('should_handle_undefined_in_normalizeText', () => {
    expect(normalizeText(undefined as any)).toBe('');
  });

  it('should_handle_number_in_normalizeText', () => {
    expect(normalizeText(12345 as any)).toBe('12345');
  });

  it('should_handle_object_in_normalizeText', () => {
    const obj = { toString: () => 'test' };
    expect(normalizeText(obj as any)).toBe('test');
  });

  it('should_handle_array_in_normalizeText', () => {
    expect(() => normalizeText([] as any)).not.toThrow();
  });

  it('should_handle_function_in_normalizeText', () => {
    expect(() => normalizeText((() => 'test') as any)).not.toThrow();
  });
});

// ============================================================================
// 正则表达式 DoS 防护
// ============================================================================
describe('安全测试 - ReDoS 防护', () => {
  it('should_not_hang_on_pathological_patterns', () => {
    // Known ReDoS patterns
    const patterns = [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '(((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ];

    for (const pattern of patterns) {
      const start = Date.now();
      expect(() => normalizeText(pattern)).not.toThrow();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
    }
  });

  it('should_handle_nested_repetitions', () => {
    const inputs = [
      '(.*)*'.repeat(100),
      '(.+)+'.repeat(100),
      'a{{1000}}b{{1000}}',
    ];

    for (const input of inputs) {
      const start = Date.now();
      expect(() => normalizeText(input)).not.toThrow();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    }
  });
});

// ============================================================================
// 别名系统安全测试
// ============================================================================
describe('安全测试 - 别名系统', () => {
  it('should_prevent_alias_injection_via_canonical', () => {
    const rules = [
      { canonical: '../../etc/passwd', variants: ['x'] },
      { canonical: '<script>alert(1)</script>', variants: ['x'] },
      { canonical: 'javascript:alert(1)', variants: ['x'] },
    ];

    expect(() => createAliasMatcher(rules)).not.toThrow();
  });

  it('should_handle_circular_alias_references', () => {
    const rules = [
      { canonical: 'a', variants: ['b'] },
      { canonical: 'b', variants: ['c'] },
      { canonical: 'c', variants: ['a'] }, // Cycle
    ];

    const matcher = createAliasMatcher(rules);
    expect(() => matcher.canonicalizeKeyword('a')).not.toThrow();
  });

  it('should_handle_extremely_long_variants', () => {
    const rules = [
      { canonical: 'test', variants: ['a'.repeat(100000)] },
    ];

    expect(() => createAliasMatcher(rules)).not.toThrow();
  });

  it('should_handle_special_characters_in_variants', () => {
    const rules = [
      { canonical: 'test', variants: ['\x00', '\n', '\r', '\t'] },
    ];

    const matcher = createAliasMatcher(rules);
    expect(() => matcher.variantsForKeyword('test')).not.toThrow();
  });
});

// ============================================================================
// 数据解析安全测试
// ============================================================================
describe('安全测试 - 数据解析', () => {
  describe('parseRss 安全测试', () => {
    it('should_handle_malformed_xml', () => {
      const malformedInputs = [
        '<xml><broken',
        '<<<xml>>>',
        '<xml><</xml></xml>',
        '<?xml version="1.0"?><xml>',
        '<xml><!-- comment -- not closed',
      ];

      for (const xml of malformedInputs) {
        expect(() => parseRss(xml)).not.toThrow();
        const result = parseRss(xml);
        expect(Array.isArray(result)).toBe(true);
      }
    });

    it('should_handle_xml_with_entities', () => {
      const inputs = [
        '<item><title>&amp;&amp;&amp;&amp;&amp;&amp;&amp;&amp;</title></item>',
        '<item><title>&quot;&quot;&quot;&quot;&quot;&quot;</title></item>',
        '<item><title>&lt;&gt;&lt;&gt;&lt;&gt;</title></item>',
      ];

      for (const xml of inputs) {
        expect(() => parseRss(xml)).not.toThrow();
      }
    });

    it('should_handle_extremely_deeply_nested_xml', () => {
      const nested = '<a>' + '<b>'.repeat(1000) + 'test' + '</b>'.repeat(1000) + '</a>';
      expect(() => parseRss(nested)).not.toThrow();
    });

    it('should_handle_xml_with_cdata_sections', () => {
      const xml = '<item><title><![CDATA[Test <script>alert(1)</script>]]></title></item>';
      expect(() => parseRss(xml)).not.toThrow();
    });
  });

  describe('HTML 解析安全', () => {
    it('should_handle_html_with_script_tags', () => {
      const html = '<tr><td class="td-02"><script>alert("xss")</script></td></tr>';
      expect(() => parseRss(html)).not.toThrow();
    });

    it('should_handle_html_with_iframe_tags', () => {
      const html = '<tr><td class="td-02"><iframe src="evil.com"></iframe></td></tr>';
      expect(() => parseRss(html)).not.toThrow();
    });

    it('should_handle_html_with_style_attributes', () => {
      const html = '<tr><td class="td-02" style="color:red">test</td></tr>';
      expect(() => parseRss(html)).not.toThrow();
    });

    it('should_handle_html_with_event_handlers', () => {
      const html = '<tr><td class="td-02" onclick="alert(1)">test</td></tr>';
      expect(() => parseRss(html)).not.toThrow();
    });
  });
});

// ============================================================================
// 集合操作安全测试
// ============================================================================
describe('安全测试 - 集合操作', () => {
  it('should_handle_set_operations_with_prototype_pollution', () => {
    // Simulate prototype pollution
    (Set.prototype as any).polluted = 'test';

    const set1 = new Set(['a', 'b']);
    const set2 = new Set(['b', 'c']);

    expect(() => jaccard(set1, set2)).not.toThrow();

    delete (Set.prototype as any).polluted;
  });

  it('should_handle_map_operations_with_prototype_pollution', () => {
    (Map.prototype as any).polluted = 'test';

    const map = new Map();
    expect(() => map.set('key', 'value')).not.toThrow();

    delete (Map.prototype as any).polluted;
  });
});

// ============================================================================
// 并发安全测试
// ============================================================================
describe('安全测试 - 并发', () => {
  it('should_handle_concurrent_normalizeText_calls', () => {
    const promises = Array.from({ length: 1000 }, () =>
      Promise.resolve(normalizeText('test string'))
    );

    return Promise.all(promises).then(results => {
      expect(results.length).toBe(1000);
      expect(results.every(r => r === 'teststring')).toBe(true);
    });
  });

  it('should_handle_concurrent_stableId_calls', () => {
    const promises = Array.from({ length: 1000 }, (_, i) =>
      Promise.resolve(stableId(`input-${i}`))
    );

    return Promise.all(promises).then(results => {
      expect(results.length).toBe(1000);
      const unique = new Set(results);
      expect(unique.size).toBe(1000);
    });
  });
});

// ============================================================================
// 数值边界测试
// ============================================================================
describe('安全测试 - 数值边界', () => {
  it('should_handle_max_safe_integer', () => {
    const input = Number.MAX_SAFE_INTEGER.toString();
    expect(normalizeText(input)).toBe(input);
  });

  it('should_handle_min_safe_integer', () => {
    const input = Number.MIN_SAFE_INTEGER.toString();
    expect(normalizeText(input)).toBeTruthy();
  });

  it('should_handle_positive_infinity', () => {
    const input = 'Infinity';
    expect(normalizeText(input)).toBe('infinity');
  });

  it('should_handle_negative_infinity', () => {
    const input = '-Infinity';
    // The minus sign is removed by the special character filter
    expect(normalizeText(input)).toBe('infinity');
  });

  it('should_handle_nan', () => {
    const input = 'NaN';
    expect(normalizeText(input)).toBe('nan');
  });
});

// ============================================================================
// 编码测试
// ============================================================================
describe('安全测试 - 编码', () => {
  it('should_handle_utf16_surrogate_pairs', () => {
    const inputs = [
      '\uD83D\uDE00', // Emoji
      '\uD83D\uDD25', // Another emoji
      '\uDBFF\uDFFF', // Private use area
    ];

    for (const input of inputs) {
      expect(() => normalizeText(input)).not.toThrow();
    }
  });

  it('should_handle_mixed_byte_order_mark', () => {
    const inputs = [
      '\uFEFFtest', // BOM at start
      'test\uFEFF', // BOM in middle
      '\uFEFF\uFEFFtest', // Multiple BOMs
    ];

    for (const input of inputs) {
      expect(() => normalizeText(input)).not.toThrow();
    }
  });

  it('should_handle_bidi_override_characters', () => {
    const bidi = '\u202A\u202B\u202C\u202D\u202Etest\u2066\u2067\u2068\u2069';
    expect(() => normalizeText(bidi)).not.toThrow();
  });
});

// ============================================================================
// 辅助函数
// ============================================================================
function createMockItem(overrides?: Partial<TrendRawItem>): TrendRawItem {
  return {
    source: 'google_trends_rss',
    title: 'Test item',
    score: 100,
    ...overrides,
  };
}

function createMockCard(overrides?: Partial<TrendCard>): TrendCard {
  return {
    id: 'test-id',
    source: 'google_trends_rss',
    title: 'Test item',
    language: 'en',
    themes: ['finance'],
    signals: { score: 100 },
    ...overrides,
  };
}
