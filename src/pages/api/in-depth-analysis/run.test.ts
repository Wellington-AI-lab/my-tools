/**
 * 测试文件：run.test.ts (in-depth-analysis API)
 * 覆盖模块：src/pages/api/in-depth-analysis/run.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './run';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockLocals(overrides = {}) {
  return {
    runtime: {
      env: {
        LLM_BASE_URL: undefined,
        LLM_API_KEY: undefined,
        LLM_MODEL: undefined,
        APIFY_TOKEN: undefined,
        ...overrides,
      },
    },
  };
}

function createMockRequest(body: any) {
  return {
    json: vi.fn(() => Promise.resolve(body)),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

// Mock the modules
vi.mock('@/lib/env', () => ({
  getEnv: vi.fn((locals) => locals.runtime.env),
}));

vi.mock('@/modules/in-depth-analysis/agent', () => ({
  runRednoteAgent: vi.fn(),
}));

import { getEnv } from '@/lib/env';
import { runRednoteAgent } from '@/modules/in-depth-analysis/agent';

const mockedGetEnv = getEnv as unknown as ReturnType<typeof vi.fn>;
const mockedRunRednoteAgent = runRednoteAgent as unknown as ReturnType<typeof vi.fn>;

// ============================================================================
// Happy Path Tests
// ============================================================================
describe('POST /api/in-depth-analysis/run - Happy Path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnv.mockImplementation((locals) => locals.runtime.env);

    mockedRunRednoteAgent.mockResolvedValue({
      meta: {
        execution_time_ms: 1234,
        items_scanned: 100,
        items_filtered: 24,
        used_datasource: 'mock',
        used_reasoning: 'mock',
      },
      logs: [
        { ts: '2024-01-01T00:00:00.000Z', stage: 'stage1', message: 'Test log' },
      ],
      insight: 'Test insight',
      trends: ['trend1', 'trend2'],
      feed: [
        {
          id: '1',
          title: 'Test Card',
          content: 'Test content',
          metrics: {
            likes: 100,
            collects: 50,
            comments: 25,
            shares: 10,
            heatScore: 500,
          },
        },
      ],
    });
  });

  it('should_return_analysis_result', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'keyword',
      timeRange: '24h',
    });

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.meta).toBeDefined();
    expect(json.meta.execution_time_ms).toBe(1234);
    expect(json.insight).toBe('Test insight');
    expect(json.trends).toEqual(['trend1', 'trend2']);
  });

  it('should_pass_environment_variables', async () => {
    // Arrange
    const locals = createMockLocals({
      LLM_BASE_URL: 'https://api.example.com',
      LLM_API_KEY: 'test-key',
      LLM_MODEL: 'gpt-4',
      APIFY_TOKEN: 'apify-token',
    });
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '7d',
    });

    // Act
    await POST({ locals, request } as any);

    // Assert
    expect(mockedRunRednoteAgent).toHaveBeenCalledWith({
      env: {
        LLM_BASE_URL: 'https://api.example.com',
        LLM_API_KEY: 'test-key',
        LLM_MODEL: 'gpt-4',
        APIFY_TOKEN: 'apify-token',
      },
      req: expect.objectContaining({
        keyword: 'test',
        timeRange: '7d',
      }),
    });
  });

  it('should_include_default_values_for_optional_params', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '30d',
    });

    // Act
    await POST({ locals, request } as any);

    // Assert - Optional params are passed as undefined if not provided
    const callArgs = mockedRunRednoteAgent.mock.calls[0];
    expect(callArgs[0].req.heatThreshold).toBeUndefined();
    expect(callArgs[0].req.topK).toBeUndefined();
  });
});

// ============================================================================
// Input Validation Tests
// ============================================================================
describe('POST /api/in-depth-analysis/run - Input Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnv.mockImplementation((locals) => locals.runtime.env);
  });

  it('should_return_400_for_missing_keyword', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      timeRange: '24h',
    });

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Invalid request');
  });

  it('should_return_400_for_empty_keyword', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: '   ',
      timeRange: '24h',
    });

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(400);
  });

  it('should_return_400_for_keyword_too_long', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'a'.repeat(81),
      timeRange: '24h',
    });

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(400);
  });

  it('should_return_400_for_invalid_time_range', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: 'invalid',
    });

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(400);
  });

  it('should_return_400_for_missing_time_range', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
    });

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(400);
  });

  it('should_accept_valid_time_ranges', async () => {
    // Arrange
    const locals = createMockLocals();
    mockedRunRednoteAgent.mockResolvedValue({
      meta: { execution_time_ms: 0, items_scanned: 0, items_filtered: 0, used_datasource: 'mock', used_reasoning: 'mock' },
      logs: [],
      insight: '',
      trends: [],
      feed: [],
    });

    const timeRanges = ['24h', '7d', '30d'];

    for (const timeRange of timeRanges) {
      const request = createMockRequest({
        keyword: 'test',
        timeRange,
      });

      // Act
      const response = await POST({ locals, request } as any);

      // Assert
      expect(response.status).toBe(200);
    }
  });

  it('should_trim_keyword_whitespace', async () => {
    // Arrange
    const locals = createMockLocals();
    mockedRunRednoteAgent.mockResolvedValue({
      meta: { execution_time_ms: 0, items_scanned: 0, items_filtered: 0, used_datasource: 'mock', used_reasoning: 'mock' },
      logs: [],
      insight: '',
      trends: [],
      feed: [],
    });

    const request = createMockRequest({
      keyword: '  test  ',
      timeRange: '24h',
    });

    // Act
    await POST({ locals, request } as any);

    // Assert
    const callArgs = mockedRunRednoteAgent.mock.calls[0];
    expect(callArgs[0].req.keyword).toBe('test');
  });

  it('should_validate_heat_threshold_range', async () => {
    // Arrange
    const locals = createMockLocals();

    // Test out of range values
    const invalidValues = [-1, 100001];

    for (const heatThreshold of invalidValues) {
      const request = createMockRequest({
        keyword: 'test',
        timeRange: '24h',
        heatThreshold,
      });

      // Act
      const response = await POST({ locals, request } as any);

      // Assert
      expect(response.status).toBe(400);
    }
  });

  it('should_validate_top_k_range', async () => {
    // Arrange
    const locals = createMockLocals();

    // Test out of range values
    const invalidValues = [0, 61, -5, 100];

    for (const topK of invalidValues) {
      const request = createMockRequest({
        keyword: 'test',
        timeRange: '24h',
        topK,
      });

      // Act
      const response = await POST({ locals, request } as any);

      // Assert
      expect(response.status).toBe(400);
    }
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================
describe('POST /api/in-depth-analysis/run - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnv.mockImplementation((locals) => locals.runtime.env);
  });

  it('should_return_500_on_agent_error', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
    });

    mockedRunRednoteAgent.mockRejectedValue(new Error('Agent failed'));

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(500);
    const json = await response.json();
    // String(new Error('Agent failed')) = 'Error: Agent failed'
    expect(json.error).toContain('Agent failed');
  });

  it('should_return_500_on_unexpected_error', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
    });

    mockedRunRednoteAgent.mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(500);
  });

  it('should_return_json_content_type_on_error', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
    });

    mockedRunRednoteAgent.mockRejectedValue(new Error('Test error'));

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.headers.get('content-type')).toBe('application/json');
  });
});

// ============================================================================
// Optional Parameters Tests
// ============================================================================
describe('POST /api/in-depth-analysis/run - Optional Parameters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnv.mockImplementation((locals) => locals.runtime.env);

    mockedRunRednoteAgent.mockResolvedValue({
      meta: { execution_time_ms: 0, items_scanned: 0, items_filtered: 0, used_datasource: 'mock', used_reasoning: 'mock' },
      logs: [],
      insight: '',
      trends: [],
      feed: [],
    });
  });

  it('should_pass_heat_threshold_when_provided', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
      heatThreshold: 100,
    });

    // Act
    await POST({ locals, request } as any);

    // Assert
    const callArgs = mockedRunRednoteAgent.mock.calls[0];
    expect(callArgs[0].req.heatThreshold).toBe(100);
  });

  it('should_pass_top_k_when_provided', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
      topK: 30,
    });

    // Act
    await POST({ locals, request } as any);

    // Assert
    const callArgs = mockedRunRednoteAgent.mock.calls[0];
    expect(callArgs[0].req.topK).toBe(30);
  });

  it('should_handle_zero_heat_threshold', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
      heatThreshold: 0,
    });

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_handle_maximum_heat_threshold', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
      heatThreshold: 100000,
    });

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_handle_minimum_top_k', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
      topK: 1,
    });

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(200);
  });

  it('should_handle_maximum_top_k', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
      topK: 60,
    });

    // Act
    const response = await POST({ locals, request } as any);

    // Assert
    expect(response.status).toBe(200);
  });
});

// ============================================================================
// Response Structure Tests
// ============================================================================
describe('POST /api/in-depth-analysis/run - Response Structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEnv.mockImplementation((locals) => locals.runtime.env);

    mockedRunRednoteAgent.mockResolvedValue({
      meta: {
        execution_time_ms: 500,
        items_scanned: 50,
        items_filtered: 10,
        used_datasource: 'mock',
        used_reasoning: 'mock',
      },
      logs: [
        { ts: '2024-01-01T00:00:00.000Z', stage: 'stage1', message: 'Scanned 50 items' },
        { ts: '2024-01-01T00:00:01.000Z', stage: 'stage2', message: 'Mock reasoning' },
        { ts: '2024-01-01T00:00:02.000Z', stage: 'stage3', message: 'Done' },
      ],
      insight: '# Test Insight\n\nThis is a test insight.',
      trends: ['trend1', 'trend2', 'trend3'],
      feed: [
        {
          id: '1',
          title: 'Test',
          content: 'Content',
          metrics: { likes: 10, collects: 5, comments: 2, shares: 1, heatScore: 50 },
        },
      ],
    });
  });

  it('should_include_all_meta_fields', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
    });

    // Act
    const response = await POST({ locals, request } as any);
    const json = await response.json();

    // Assert
    expect(json.meta.execution_time_ms).toBe(500);
    expect(json.meta.items_scanned).toBe(50);
    expect(json.meta.items_filtered).toBe(10);
    expect(json.meta.used_datasource).toBe('mock');
    expect(json.meta.used_reasoning).toBe('mock');
  });

  it('should_include_logs', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
    });

    // Act
    const response = await POST({ locals, request } as any);
    const json = await response.json();

    // Assert
    expect(json.logs).toHaveLength(3);
    expect(json.logs[0].stage).toBe('stage1');
  });

  it('should_include_trends', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
    });

    // Act
    const response = await POST({ locals, request } as any);
    const json = await response.json();

    // Assert
    expect(json.trends).toEqual(['trend1', 'trend2', 'trend3']);
  });

  it('should_include_feed', async () => {
    // Arrange
    const locals = createMockLocals();
    const request = createMockRequest({
      keyword: 'test',
      timeRange: '24h',
    });

    // Act
    const response = await POST({ locals, request } as any);
    const json = await response.json();

    // Assert
    expect(json.feed).toHaveLength(1);
    expect(json.feed[0].id).toBe('1');
  });
});
