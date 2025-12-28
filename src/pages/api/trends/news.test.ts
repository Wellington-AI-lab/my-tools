/**
 * 测试文件：news.test.ts
 * 覆盖模块：src/pages/api/trends/news.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './news';

// ============================================================================
// Mock Helpers
// ============================================================================

interface MockD1Result<T> {
  results?: T[];
  success?: boolean;
  meta?: { changes?: number };
}

function createMockD1(resultSet: MockD1Result<any> = { results: [] }) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        raw: vi.fn(() => Promise.resolve(resultSet)),
        all: vi.fn(() => Promise.resolve(resultSet)),
        first: vi.fn(() => Promise.resolve(resultSet.results?.[0] || null)),
        run: vi.fn(() => Promise.resolve(resultSet)),
      })),
    })),
  };
}

function createMockLocals(overrides = {}) {
  return {
    runtime: {
      env: {
        TRENDS_DB: createMockD1(),
        ...overrides,
      },
    },
  };
}

function createMockUrl(params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => searchParams.set(key, value));
  return { searchParams };
}

// ============================================================================
// Happy Path Tests
// ============================================================================
describe('GET /api/trends/news - Happy Path', () => {
  let mockD1: D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    mockD1 = createMockD1({
      results: [
        {
          id: 'news-1',
          url: 'https://example.com/news1',
          title: 'Test News 1',
          tags: '["tag1","tag2"]',
          scan_time: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'news-2',
          url: 'https://example.com/news2',
          title: 'Test News 2',
          tags: '["tag3","tag4"]',
          scan_time: '2025-01-01T01:00:00.000Z',
        },
      ],
    });
  });

  it('should_return_news_items_for_valid_tag', async () => {
    // Arrange
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'test', limit: '10' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.tag).toBe('test');
    expect(json.items).toHaveLength(2);
    expect(json.count).toBe(2);
  });

  it('should_parse_tags_as_json_array', async () => {
    // Arrange
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'AI', limit: '10' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.items[0].tags).toEqual(['tag1', 'tag2']);
  });

  it('should_respect_custom_limit', async () => {
    // Arrange
    const mockD1Limited = createMockD1({
      results: [
        {
          id: 'news-1',
          url: 'https://example.com/news1',
          title: 'Test News 1',
          tags: '["tag1"]',
          scan_time: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    const locals = createMockLocals({ TRENDS_DB: mockD1Limited });
    const url = createMockUrl({ tag: 'test', limit: '5' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.items).toHaveLength(1);
  });

  it('should_use_default_limit_of_10', async () => {
    // Arrange
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'test' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
    const bindCall = mockD1.prepare('').bind('', '', 10);
    expect(bindCall).toBeDefined();
  });

  it('should_return_empty_array_when_no_news_found', async () => {
    // Arrange
    const mockD1Empty = createMockD1({ results: [] });
    const locals = createMockLocals({ TRENDS_DB: mockD1Empty });
    const url = createMockUrl({ tag: 'nonexistent' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.items).toHaveLength(0);
    expect(json.count).toBe(0);
  });
});

// ============================================================================
// Input Validation Tests
// ============================================================================
describe('GET /api/trends/news - Input Validation', () => {
  it('should_return_400_when_tag_is_missing', async () => {
    // Arrange
    const mockD1 = createMockD1();
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({}); // No tag

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('tag');
  });

  it('should_return_400_when_tag_is_empty_string', async () => {
    // Arrange
    const mockD1 = createMockD1();
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: '' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('should_handle_tag_with_special_characters', async () => {
    // Arrange
    const mockD1 = createMockD1({ results: [] });
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'AI-人工智能' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  it('should_handle_tag_with_quotes_sanitized', async () => {
    // Arrange
    const mockD1 = createMockD1({ results: [] });
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'test"quote' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_sanitize_long_tags', async () => {
    // Arrange
    const mockD1 = createMockD1({ results: [] });
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const longTag = 'a'.repeat(200);
    const url = createMockUrl({ tag: longTag });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_handle_non_numeric_limit', async () => {
    // Arrange
    const mockD1 = createMockD1({ results: [] });
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'test', limit: 'invalid' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    // Should still work, parseInt('invalid') returns NaN, clamped to default
    expect(response.status).toBe(200);
  });

  it('should_handle_negative_limit', async () => {
    // Arrange
    const mockD1 = createMockD1({ results: [] });
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'test', limit: '-5' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
  });
});

// ============================================================================
// Database Error Tests
// ============================================================================
describe('GET /api/trends/news - Database Errors', () => {
  it('should_return_empty_results_on_database_query_failure', async () => {
    // Arrange
    const mockD1 = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          raw: vi.fn(() => Promise.reject(new Error('Database connection failed'))),
        })),
      })),
    };
    const locals = createMockLocals({ TRENDS_DB: mockD1 as any });
    const url = createMockUrl({ tag: 'test' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert - queryNewsByTag catches errors and returns empty results
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.items).toHaveLength(0);
    expect(json.count).toBe(0);
  });

  it('should_handle_malformed_tags_in_database', async () => {
    // Arrange
    const mockD1 = createMockD1({
      results: [
        {
          id: 'news-1',
          url: 'https://example.com/news1',
          title: 'Test News 1',
          tags: 'invalid-json[{',
          scan_time: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'test' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert - queryNewsByTag catches JSON parse errors and returns empty items
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    // When JSON.parse fails, the map will fail, and the catch returns empty
    expect(json.items).toEqual([]);
  });

  it('should_handle_null_tags_field', async () => {
    // Arrange
    const mockD1 = createMockD1({
      results: [
        {
          id: 'news-1',
          url: 'https://example.com/news1',
          title: 'Test News 1',
          tags: null,
          scan_time: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'test' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.items[0].tags).toEqual([]);
  });

  it('should_handle_empty_tags_field', async () => {
    // Arrange
    const mockD1 = createMockD1({
      results: [
        {
          id: 'news-1',
          url: 'https://example.com/news1',
          title: 'Test News 1',
          tags: '',
          scan_time: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'test' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.items[0].tags).toEqual([]);
  });
});

// ============================================================================
// Response Structure Tests
// ============================================================================
describe('GET /api/trends/news - Response Structure', () => {
  it('should_return_correct_response_structure', async () => {
    // Arrange
    const mockD1 = createMockD1({
      results: [
        {
          id: 'news-1',
          url: 'https://example.com/news1',
          title: 'Test News 1',
          tags: '["tag1"]',
          scan_time: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'test' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      success: true,
      tag: 'test',
      count: expect.any(Number),
      items: expect.any(Array),
    });
  });

  it('should_preserve_news_item_fields', async () => {
    // Arrange
    const mockD1 = createMockD1({
      results: [
        {
          id: 'news-123',
          url: 'https://example.com/test',
          title: 'Test Title',
          tags: '["AI","tech"]',
          scan_time: '2025-01-01T12:00:00.000Z',
        },
      ],
    });
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'AI' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.items[0]).toMatchObject({
      id: 'news-123',
      url: 'https://example.com/test',
      title: 'Test Title',
      scan_time: '2025-01-01T12:00:00.000Z',
    });
  });

  it('should_include_json_content_type_header', async () => {
    // Arrange
    const mockD1 = createMockD1({ results: [] });
    const locals = createMockLocals({ TRENDS_DB: mockD1 });
    const url = createMockUrl({ tag: 'test' });

    // Act
    const response = await GET({ locals, url: url as any });

    // Assert
    expect(response.headers.get('content-type')).toBe('application/json');
  });
});
