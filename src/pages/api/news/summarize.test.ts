/**
 * 测试文件：summarize.test.ts
 * 覆盖模块：src/pages/api/news/summarize.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST, OPTIONS } from './summarize';
import type { KVStorage } from '@/lib/storage/kv';
import type { AIEnrichment } from '@/modules/news/types';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockKV(): KVStorage {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockLocals(kv?: KVStorage): App.Locals {
  return {
    runtime: {
      env: {},
    },
  } as App.Locals;
}

function createMockRequest(
  url: string,
  body: any,
  headers: Record<string, string> = {}
): Request {
  return {
    url,
    headers: {
      get: vi.fn((name: string) => headers[name?.toLowerCase()] || null),
    },
    json: async () => body,
  } as any;
}

// ============================================================================
// Process.env Mocking
// ============================================================================

const originalEnv = process.env;

function mockEnv(env: Partial<NodeJS.ProcessEnv>) {
  process.env = { ...originalEnv, ...env } as any;
}

function resetEnv() {
  process.env = originalEnv;
}

// ============================================================================
// Mock Modules
// ============================================================================

// Mock env module
vi.mock('@/lib/env', () => ({
  requireKV: vi.fn((locals: App.Locals) => mockKV),
  getEnv: vi.fn(() => mockEnvVars),
}));

import { requireKV, getEnv } from '@/lib/env';

let mockKV: KVStorage;
let mockEnvVars: any = {};

// Mock AI refinery
vi.mock('@/modules/news/ai-refinery', () => ({
  getCachedEnrichment: vi.fn(),
  setCachedEnrichment: vi.fn(),
}));

import { getCachedEnrichment, setCachedEnrichment } from '@/modules/news/ai-refinery';

// Mock LLM client
vi.mock('@/modules/in-depth-analysis/llm/openai-compatible-client', () => ({
  openAICompatibleChatCompletion: vi.fn(),
}));

import { openAICompatibleChatCompletion } from '@/modules/in-depth-analysis/llm/openai-compatible-client';

// ============================================================================
// Mock fetch
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ============================================================================
// Setup & Teardown
// ============================================================================

beforeEach(() => {
  mockKV = createMockKV();
  vi.mocked(requireKV).mockReturnValue(mockKV);
  mockEnvVars = {
    LLM_BASE_URL: 'https://api.openai.com',
    LLM_API_KEY: 'test-key',
    LLM_MODEL: 'gpt-4',
  };
  vi.clearAllMocks();
});

afterEach(() => {
  resetEnv();
});

// ============================================================================
// OPTIONS Tests
// ============================================================================
describe('OPTIONS /api/news/summarize', () => {
  it('should_return_cors_headers', async () => {
    // Act
    const response = await OPTIONS();

    // Assert
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  });
});

// ============================================================================
// POST Tests - Authentication
// ============================================================================
describe('POST /api/news/summarize - Authentication', () => {
  it('should_return_503_when_llm_base_url_missing', async () => {
    // Arrange
    mockEnvVars = {
      LLM_BASE_URL: undefined,
      LLM_API_KEY: 'test-key',
      LLM_MODEL: 'gpt-4',
    };

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/article',
      title: 'Test Article',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(503);
    expect(data.success).toBe(false);
    expect(data.error).toContain('LLM not configured');
  });

  it('should_return_503_when_llm_api_key_missing', async () => {
    // Arrange
    mockEnvVars = {
      LLM_BASE_URL: 'https://api.openai.com',
      LLM_API_KEY: undefined,
      LLM_MODEL: 'gpt-4',
    };

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/article',
      title: 'Test Article',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(503);
    expect(data.success).toBe(false);
  });

  it('should_return_503_when_llm_model_missing', async () => {
    // Arrange
    mockEnvVars = {
      LLM_BASE_URL: 'https://api.openai.com',
      LLM_API_KEY: 'test-key',
      LLM_MODEL: undefined,
    };

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/article',
      title: 'Test Article',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(503);
    expect(data.success).toBe(false);
  });
});

// ============================================================================
// POST Tests - Request Validation
// ============================================================================
describe('POST /api/news/summarize - Request Validation', () => {
  it('should_return_400_when_request_body_is_invalid_json', async () => {
    // Arrange
    const request = {
      url: 'https://example.com/api/news/summarize',
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      headers: { get: vi.fn() },
    } as any;
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid JSON body');
  });

  it('should_return_400_when_url_is_missing', async () => {
    // Arrange
    const request = createMockRequest('https://example.com/api/news/summarize', {
      title: 'Test Article',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Missing required fields: url, title');
  });

  it('should_return_400_when_title_is_missing', async () => {
    // Arrange
    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/article',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Missing required fields: url, title');
  });

  it('should_accept_request_with_url_and_title_only', async () => {
    // Arrange
    const mockEnrichment: AIEnrichment = {
      category: 'engineering',
      bottom_line: 'A significant engineering breakthrough.',
      signal_score: 7,
    };

    vi.mocked(getCachedEnrichment).mockResolvedValue(mockEnrichment);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/article',
      title: 'Test Article',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should_accept_request_with_optional_fields', async () => {
    // Arrange
    const mockEnrichment: AIEnrichment = {
      category: 'ai',
      bottom_line: 'AI research advancement.',
      signal_score: 8,
      key_insights: ['insight1', 'insight2'],
    };

    vi.mocked(getCachedEnrichment).mockResolvedValue(mockEnrichment);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/article',
      title: 'Test Article',
      summary: 'This is a test summary with enough content.',
      source: 'Tech News',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

// ============================================================================
// POST Tests - Cache Hit
// ============================================================================
describe('POST /api/news/summarize - Cache Hit', () => {
  it('should_return_cached_enrichment_when_available', async () => {
    // Arrange
    const mockEnrichment: AIEnrichment = {
      category: 'engineering',
      bottom_line: 'OpenAI releases new model with improved reasoning.',
      signal_score: 8,
      key_insights: ['Better performance', 'Lower cost'],
    };

    vi.mocked(getCachedEnrichment).mockResolvedValue(mockEnrichment);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/article1',
      title: 'Test Article',
      summary: 'Test summary',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.cached).toBe(true);
    expect(data.data).toMatchObject({
      url: 'https://example.com/article1',
      category: 'engineering',
      bottom_line: 'OpenAI releases new model with improved reasoning.',
      signal_score: 8,
      key_insights: ['Better performance', 'Lower cost'],
    });
    expect(getCachedEnrichment).toHaveBeenCalledWith(mockKV, 'https://example.com/article1');
    expect(openAICompatibleChatCompletion).not.toHaveBeenCalled();
  });

  it('should_return_full_cached_enrichment_with_all_fields', async () => {
    // Arrange
    const mockEnrichment: AIEnrichment = {
      category: 'business',
      bottom_line: 'Company raises $100M in Series B funding.',
      signal_score: 6,
      key_insights: ['Led by prominent VC', 'Plans expansion'],
    };

    vi.mocked(getCachedEnrichment).mockResolvedValue(mockEnrichment);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/funding',
      title: 'Funding News',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(data.data.category).toBe('business');
    expect(data.data.bottom_line).toBe('Company raises $100M in Series B funding.');
    expect(data.data.signal_score).toBe(6);
    expect(data.data.key_insights).toEqual(['Led by prominent VC', 'Plans expansion']);
    expect(data.timestamp).toBeDefined();
  });
});

// ============================================================================
// POST Tests - Cache Miss / Processing
// ============================================================================
describe('POST /api/news/summarize - Cache Miss / Processing', () => {
  it('should_process_article_when_not_cached', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);

    const llmResponse = JSON.stringify({
      category: 'ai',
      bottom_line: 'New AI model achieves state-of-the-art performance.',
      signal_score: 9,
      key_insights: ['Benchmark improvements', 'Efficiency gains'],
    });

    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue(llmResponse);
    vi.mocked(setCachedEnrichment).mockResolvedValue(undefined);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/ai-news',
      title: 'AI Breakthrough',
      summary: 'New AI model announced.',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.cached).toBe(false);
    expect(data.data).toMatchObject({
      url: 'https://example.com/ai-news',
      category: 'ai',
      signal_score: 9,
    });
    expect(openAICompatibleChatCompletion).toHaveBeenCalled();
    expect(setCachedEnrichment).toHaveBeenCalledWith(
      mockKV,
      'https://example.com/ai-news',
      expect.objectContaining({
        category: 'ai',
        bottom_line: expect.any(String),
        signal_score: expect.any(Number),
      })
    );
  });

  it('should_handle_llm_response_with_markdown_code_blocks', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);

    const llmResponse = '```json\n' + JSON.stringify({
      category: 'product',
      bottom_line: 'Product launch with new features.',
      signal_score: 5,
      key_insights: ['Feature 1', 'Feature 2'],
    }) + '\n```';

    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue(llmResponse);
    vi.mocked(setCachedEnrichment).mockResolvedValue(undefined);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/product',
      title: 'Product Launch',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.data.category).toBe('product');
  });

  it('should_cap_signal_score_between_0_and_10', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);

    const llmResponse = JSON.stringify({
      category: 'engineering',
      bottom_line: 'Test',
      signal_score: 15, // Should be capped at 10
    });

    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue(llmResponse);
    vi.mocked(setCachedEnrichment).mockResolvedValue(undefined);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/test',
      title: 'Test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(data.data.signal_score).toBe(10);
  });

  it('should_cap_negative_signal_score_at_0', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);

    const llmResponse = JSON.stringify({
      category: 'noise',
      bottom_line: 'Test',
      signal_score: -5,
    });

    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue(llmResponse);
    vi.mocked(setCachedEnrichment).mockResolvedValue(undefined);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/test',
      title: 'Test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(data.data.signal_score).toBe(0);
  });

  it('should_validate_category_and_default_to_noise', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);

    const llmResponse = JSON.stringify({
      category: 'invalid-category',
      bottom_line: 'Test',
      signal_score: 5,
    });

    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue(llmResponse);
    vi.mocked(setCachedEnrichment).mockResolvedValue(undefined);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/test',
      title: 'Test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(data.data.category).toBe('noise');
  });
});

// ============================================================================
// POST Tests - Error Handling
// ============================================================================
describe('POST /api/news/summarize - Error Handling', () => {
  it('should_return_500_when_llm_call_fails', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);
    vi.mocked(openAICompatibleChatCompletion).mockRejectedValue(
      new Error('LLM service unavailable')
    );

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/test',
      title: 'Test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('LLM service unavailable');
  });

  it('should_return_500_when_llm_response_is_invalid_json', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);
    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue('not valid json');

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/test',
      title: 'Test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  it('should_return_500_when_llm_response_missing_required_fields', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);

    const llmResponse = JSON.stringify({
      category: 'engineering',
      // Missing bottom_line
      // Missing signal_score
    });

    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue(llmResponse);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/test',
      title: 'Test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  it('should_limit_key_insights_to_3_items', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);

    const llmResponse = JSON.stringify({
      category: 'engineering',
      bottom_line: 'Test',
      signal_score: 7,
      key_insights: ['insight1', 'insight2', 'insight3', 'insight4', 'insight5'],
    });

    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue(llmResponse);
    vi.mocked(setCachedEnrichment).mockResolvedValue(undefined);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/test',
      title: 'Test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.data.key_insights).toHaveLength(3);
  });

  it('should_handle_missing_key_insights', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);

    const llmResponse = JSON.stringify({
      category: 'engineering',
      bottom_line: 'Test',
      signal_score: 7,
      // No key_insights field
    });

    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue(llmResponse);
    vi.mocked(setCachedEnrichment).mockResolvedValue(undefined);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/test',
      title: 'Test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.data.key_insights).toBeUndefined();
  });

  it('should_filter_non_string_key_insights', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);

    const llmResponse = JSON.stringify({
      category: 'engineering',
      bottom_line: 'Test',
      signal_score: 7,
      key_insights: ['valid', 123, null, 'also-valid', { invalid: 'object' }],
    });

    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue(llmResponse);
    vi.mocked(setCachedEnrichment).mockResolvedValue(undefined);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/test',
      title: 'Test',
    });
    const locals = createMockLocals(mockKV);

    // Act
    const response = await POST({ locals, request });
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.data.key_insights).toEqual(['valid', 'also-valid']);
  });
});

// ============================================================================
// POST Tests - LLM Client Integration
// ============================================================================
describe('POST /api/news/summarize - LLM Client Integration', () => {
  it('should_pass_correct_parameters_to_llm_client', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);

    const llmResponse = JSON.stringify({
      category: 'science',
      bottom_line: 'Scientific discovery in quantum computing.',
      signal_score: 8,
    });

    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue(llmResponse);
    vi.mocked(setCachedEnrichment).mockResolvedValue(undefined);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/quantum',
      title: 'Quantum Breakthrough',
      summary: 'Scientists achieve quantum supremacy.',
      source: 'Science Daily',
    });
    const locals = createMockLocals(mockKV);

    // Act
    await POST({ locals, request });

    // Assert
    expect(openAICompatibleChatCompletion).toHaveBeenCalledWith({
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      model: 'gpt-4',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Quantum Breakthrough'),
        }),
      ]),
      temperature: 0.2,
      maxTokens: 500,
      timeoutMs: 12000,
    });
  });

  it('should_truncate_summary_in_prompt', async () => {
    // Arrange
    vi.mocked(getCachedEnrichment).mockResolvedValue(null);

    const longSummary = 'A'.repeat(2000);
    const llmResponse = JSON.stringify({
      category: 'engineering',
      bottom_line: 'Test',
      signal_score: 5,
    });

    vi.mocked(openAICompatibleChatCompletion).mockResolvedValue(llmResponse);
    vi.mocked(setCachedEnrichment).mockResolvedValue(undefined);

    const request = createMockRequest('https://example.com/api/news/summarize', {
      url: 'https://example.com/test',
      title: 'Test',
      summary: longSummary,
    });
    const locals = createMockLocals(mockKV);

    // Act
    await POST({ locals, request });

    // Assert
    const callArgs = vi.mocked(openAICompatibleChatCompletion).mock.calls[0][0];
    const promptContent = callArgs.messages[1].content;

    // Summary should be truncated to 1000 chars in the prompt
    expect(promptContent).toContain('A'.repeat(1000));
    expect(promptContent).not.toContain('A'.repeat(1500));
  });
});
