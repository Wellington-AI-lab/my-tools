/**
 * News Refinery Pipeline Tests
 *
 * 测试 Refinery 模式的各个阶段:
 * - 清洗 (Cleaning)
 * - 信号过滤 (Signal Filtering)
 * - 去重 (Deduplication)
 * - 精炼 (Refining)
 */

import { describe, it, expect } from 'vitest';
import {
  processRefinery,
  parseRssXml,
  isValidRssContent,
  detectLanguage,
  similarity,
  stripHtml,
  truncateText,
  REFINERY_CONFIG,
} from './refinery';
import type { RawRssItem, SignalFilter } from './types';

// ============================================================================
// 测试数据
// ============================================================================

const VALID_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>A test feed</description>
    <item>
      <title>First Article</title>
      <link>https://example.com/1</link>
      <description>This is a test article with some content.</description>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <author>Test Author</author>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/2</link>
      description&gt;Another test article.&lt;/description&gt;
      <pubDate>Mon, 01 Jan 2024 13:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const INVALID_RSS_HTML = `
<html>
  <head><title>Not RSS</title></head>
  <body>This is not an RSS feed</body>
</html>
`;

const SAMPLE_RAW_ITEMS: RawRssItem[] = [
  {
    title: 'Breaking: New AI Model Released',
    link: 'https://example.com/ai-model',
    description: 'A revolutionary new AI model has been announced.',
    pubDate: new Date(Date.now() - 3600000).toISOString(),  // 1 hour ago
    source: 'Tech News',
  },
  {
    title: 'AD: Buy Now!',
    link: 'https://example.com/ad',
    description: 'Special offer just for you!',
    source: 'Spam Source',
  },
  {
    title: 'Short',
    link: 'https://example.com/short',
    description: 'Too brief',
    source: 'Low Quality',
  },
  {
    title: 'Deep Dive into Web Development',
    link: 'https://example.com/web-dev',
    description: 'A comprehensive guide to modern web development practices, covering everything from HTML to advanced frameworks.',
    content: 'This is a longer article content with substantial information about web development.',
    source: 'Dev Blog',
  },
  {
    title: 'Breaking: New AI Model Released',
    link: 'https://example.com/ai-model-duplicate',
    description: 'A revolutionary new AI model has been announced.',
    source: 'Tech News',
  },
];

// ============================================================================
// 工具函数测试
// ============================================================================

describe('News Refinery - Utility Functions', () => {
  describe('stripHtml', () => {
    it('should remove HTML tags', () => {
      expect(stripHtml('<p>Hello <strong>World</strong></p>')).toBe('Hello World');
    });

    it('should remove script tags and content', () => {
      expect(stripHtml('<p>Hello</p><script>alert("xss")</script>')).toBe('Hello');
    });

    it('should handle nested tags', () => {
      expect(stripHtml('<div><span>Nested</span> content</div>')).toBe('Nested content');
    });

    it('should decode HTML entities', () => {
      expect(stripHtml('Hello &amp; goodbye')).toBe('Hello & goodbye');
      expect(stripHtml('&lt;tag&gt;')).toBe('<tag>');
    });

    it('should handle empty strings', () => {
      expect(stripHtml('')).toBe('');
    });
  });

  describe('truncateText', () => {
    it('should not truncate short text', () => {
      expect(truncateText('Short', 20)).toBe('Short');
    });

    it('should truncate long text', () => {
      const result = truncateText('This is a very long text that should be truncated.', 20);
      expect(result.length).toBeLessThanOrEqual(23);  // 20 + '...'
    });

    it('should add ellipsis', () => {
      const result = truncateText('This is a long piece of text.', 15);
      expect(result).toContain('...');
    });
  });

  describe('detectLanguage', () => {
    it('should detect Chinese text', () => {
      expect(detectLanguage('这是一篇中文文章')).toBe('zh');
    });

    it('should detect English text', () => {
      expect(detectLanguage('This is an English article')).toBe('en');
    });

    it('should return other for mixed content', () => {
      expect(detectLanguage('Hello 你好')).toBe('other');
    });

    it('should handle empty strings', () => {
      expect(detectLanguage('')).toBe('other');
    });
  });

  describe('similarity', () => {
    it('should detect identical strings', () => {
      expect(similarity('test', 'test')).toBe(1.0);
    });

    it('should detect similar strings', () => {
      const sim = similarity('Breaking: AI Model Released', 'Breaking AI Model Released');
      expect(sim).toBeGreaterThan(0.8);
    });

    it('should detect different strings', () => {
      const sim = similarity('Completely different', 'Nothing alike');
      expect(sim).toBeLessThan(0.5);
    });
  });
});

// ============================================================================
// RSS 解析测试
// ============================================================================

describe('News Refinery - RSS Parsing', () => {
  describe('parseRssXml', () => {
    it('should parse valid RSS XML', () => {
      const items = parseRssXml(VALID_RSS_XML, 'Test Feed');
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('First Article');
      expect(items[0].source).toBe('Test Feed');
    });

    it('should extract all fields', () => {
      const items = parseRssXml(VALID_RSS_XML, 'Test Feed');
      const first = items[0];
      expect(first.title).toBe('First Article');
      expect(first.link).toBe('https://example.com/1');
      expect(first.description).toBeTruthy();
      expect(first.author).toBe('Test Author');
    });

    it('should handle items without optional fields', () => {
      const items = parseRssXml(VALID_RSS_XML, 'Test Feed');
      const second = items[1];
      expect(second.title).toBe('Second Article');
      expect(second.author).toBeUndefined();
    });

    it('should return empty array for invalid RSS', () => {
      const items = parseRssXml('not rss', 'Test');
      expect(items).toHaveLength(0);
    });
  });

  describe('isValidRssContent', () => {
    it('should validate RSS feed', () => {
      expect(isValidRssContent(VALID_RSS_XML)).toBe(true);
    });

    it('should reject non-RSS content', () => {
      expect(isValidRssContent(INVALID_RSS_HTML)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidRssContent('')).toBe(false);
    });
  });
});

// ============================================================================
// Refinery 流水线测试
// ============================================================================

describe('News Refinery - Pipeline', () => {
  describe('processRefinery', () => {
    it('should filter out blocked keywords', () => {
      const result = processRefinery(SAMPLE_RAW_ITEMS);
      // Check that the spam ad URL is filtered out
      const hasSpamAd = result.articles.some(a => a.url === 'https://example.com/ad');
      expect(hasSpamAd).toBe(false);
    });

    it('should filter by title length', () => {
      const result = processRefinery(SAMPLE_RAW_ITEMS);
      const hasShort = result.articles.some(a => a.title.length < 5);
      expect(hasShort).toBe(false);
    });

    it('should deduplicate similar titles', () => {
      const result = processRefinery(SAMPLE_RAW_ITEMS);
      const aiArticles = result.articles.filter(a => a.title.includes('AI Model'));
      // Should only have one AI Model article despite duplicate
      expect(aiArticles.length).toBe(1);
    });

    it('should include signal scores', () => {
      const result = processRefinery(SAMPLE_RAW_ITEMS);
      for (const article of result.articles) {
        expect(article.signal_score).toBeGreaterThanOrEqual(0);
        expect(article.signal_score).toBeLessThanOrEqual(1);
      }
    });

    it('should detect languages', () => {
      const result = processRefinery(SAMPLE_RAW_ITEMS);
      for (const article of result.articles) {
        expect(['zh', 'en', 'other']).toContain(article.language);
      }
    });

    it('should return stats', () => {
      const result = processRefinery(SAMPLE_RAW_ITEMS);
      expect(result.stats).toBeDefined();
      expect(result.stats.total_raw).toBe(SAMPLE_RAW_ITEMS.length);
      expect(result.stats.final_count).toBeLessThanOrEqual(result.stats.total_raw);
      // processing_time_ms can be very small, check it's a number
      expect(typeof result.stats.processing_time_ms).toBe('number');
    });

    it('should sort by signal score and time', () => {
      const items: RawRssItem[] = [
        {
          title: 'Old Article',
          link: 'https://example.com/old',
          description: 'Old content with substantial information for testing.',
          pubDate: new Date(Date.now() - 86400000).toISOString(),
          source: 'Test',
        },
        {
          title: 'New Quality Article',
          link: 'https://example.com/new',
          description: 'A comprehensive guide with substantial content that should score well.',
          pubDate: new Date().toISOString(),
          source: 'Test',
        },
      ];

      const result = processRefinery(items);
      // Newest and highest quality should be first
      expect(result.articles[0].title).toBe('New Quality Article');
    });
  });

  describe('Custom Filter', () => {
    it('should respect custom filter rules', () => {
      const customFilter: Partial<SignalFilter> = {
        blockedKeywords: ['breaking', 'ai'],
      };

      const result = processRefinery(SAMPLE_RAW_ITEMS, customFilter);
      const hasBlocked = result.articles.some(a =>
        a.title.toLowerCase().includes('breaking') || a.title.toLowerCase().includes('ai')
      );
      expect(hasBlocked).toBe(false);
    });

    it('should support required keywords', () => {
      const customFilter: Partial<SignalFilter> = {
        requiredKeywords: ['Web'],
      };

      const result = processRefinery(SAMPLE_RAW_ITEMS, customFilter);
      // Only the Web Development article should remain
      const hasWeb = result.articles.some(a =>
        a.title.includes('Web') || a.summary?.includes('Web')
      );
      expect(hasWeb).toBe(true);
      // All remaining articles should contain "Web"
      expect(result.articles.every(a =>
        a.title.includes('Web') || a.summary?.includes('Web')
      )).toBe(true);
    });
  });
});

// ============================================================================
// 配置测试
// ============================================================================

describe('News Refinery - Configuration', () => {
  it('should export default config', () => {
    expect(REFINERY_CONFIG).toBeDefined();
    expect(REFINERY_CONFIG.DEFAULT_FILTER).toBeDefined();
    expect(REFINERY_CONFIG.SIGNAL_WEIGHTS).toBeDefined();
    expect(REFINERY_CONFIG.CACHE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('should have sensible defaults', () => {
    const { DEFAULT_FILTER, SIGNAL_WEIGHTS } = REFINERY_CONFIG;

    expect(DEFAULT_FILTER.minTitleLength).toBeGreaterThan(0);
    expect(DEFAULT_FILTER.maxTitleLength).toBeGreaterThan(DEFAULT_FILTER.minTitleLength);
    expect(DEFAULT_FILTER.blockedKeywords.length).toBeGreaterThan(0);

    const weightSum = Object.values(SIGNAL_WEIGHTS).reduce((sum, v) => sum + v, 0);
    expect(weightSum).toBeCloseTo(1.0, 1);
  });
});
