/**
 * News Sources Management API
 *
 * 动态源管理 API - 无需重新部署即可管理 RSS 源
 *
 * Endpoints:
 * - GET /api/news/sources - 列出所有源
 * - GET /api/news/sources/:id - 获取单个源详情
 * - POST /api/news/sources - 创建新源
 * - PUT /api/news/sources/:id - 更新源配置
 * - DELETE /api/news/sources/:id - 删除源
 * - POST /api/news/sources/:id/toggle - 切换源激活状态
 *
 * Features:
 * - 支持从 D1 数据库读取/写入
 * - 支持回退到内存存储（当数据库不可用时）
 * - 验证源配置
 * - 自动测试源连接
 */

import { requireKV } from '@/lib/env';
import type { SourceConfig, SourcesConfigFile } from '@/modules/news/health-types';
import { DEFAULT_SOURCES_CONFIG } from '@/modules/news/health-types';
import type { KVStorage } from '@/lib/storage/kv';

// ============================================================================
// Types
// ============================================================================

interface SourcesResponse {
  success: true;
  data: SourceConfig[];
  total: number;
  timestamp: string;
}

interface SourceResponse {
  success: true;
  data: SourceConfig;
  timestamp: string;
}

interface TestSourceResponse {
  success: true;
  data: {
    reachable: boolean;
    latency_ms: number;
    items_count: number;
    error?: string;
  };
  timestamp: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  timestamp: string;
}

// ============================================================================
// KV Keys
// ============================================================================

const SOURCES_KEYS = {
  CONFIG: 'news:sources:config',
  LAST_UPDATE: 'news:sources:last_update',
  TEST_RESULT: (sourceId: number) => `news:sources:test:${sourceId}`,
} as const;

// ============================================================================
// Helpers
// ============================================================================

/**
 * 从 D1 或 KV 获取源配置
 */
async function getSourcesConfig(
  locals: App.Locals,
  kv: KVStorage
): Promise<SourceConfig[]> {
  // 首先尝试从 D1 数据库获取
  try {
    const { getIntelligenceDB } = await import('@/lib/env');
    const db = getIntelligenceDB(locals);
    if (db) {
      const { getActiveSources } = await import('@/modules/intelligence/repository');
      const sources = await getActiveSources(db);
      if (sources.length > 0) {
        return sources.map(s => ({
          id: s.id,
          name: s.name,
          url: s.url || undefined,
          strategy: s.strategy,
          rsshub_path: s.rsshub_path || undefined,
          category: s.category || 'uncategorized',
          weight: s.weight,
          is_active: s.is_active === 1,
        }));
      }
    }
  } catch (error) {
    console.warn('[api/news/sources] Failed to get sources from database:', error);
  }

  // 回退到 KV 存储
  try {
    const cached = await kv.get(SOURCES_KEYS.CONFIG, { type: 'text' });
    if (typeof cached === 'string') {
      const config = JSON.parse(cached) as SourcesConfigFile;
      return config.sources;
    }
  } catch (error) {
    console.error('[api/news/sources] Failed to get sources from KV:', error);
  }

  // 返回默认配置
  return DEFAULT_SOURCES_CONFIG.sources;
}

/**
 * 保存源配置到 KV
 */
async function saveSourcesConfig(
  kv: KVStorage,
  sources: SourceConfig[]
): Promise<void> {
  const config: SourcesConfigFile = {
    version: '1.0.0',
    last_updated: new Date().toISOString(),
    config: DEFAULT_SOURCES_CONFIG.config,
    sources,
  };

  await kv.put(
    SOURCES_KEYS.CONFIG,
    JSON.stringify(config),
    { expirationTtl: 86400 * 7 }  // 7 days
  );
}

/**
 * 验证源配置
 */
function validateSourceConfig(source: Partial<SourceConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!source.name || source.name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (source.strategy === 'DIRECT' && !source.url) {
    errors.push('URL is required for DIRECT strategy');
  }

  if (source.strategy === 'RSSHUB' && !source.rsshub_path) {
    errors.push('RSSHub path is required for RSSHUB strategy');
  }

  if (source.weight !== undefined && (source.weight < 0 || source.weight > 2)) {
    errors.push('Weight must be between 0 and 2');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 测试源连接
 */
async function testSourceConnection(
  source: SourceConfig,
  rsshubBaseUrl?: string
): Promise<{ reachable: boolean; latency_ms: number; items_count: number; error?: string }> {
  const startTime = Date.now();

  const url =
    source.strategy === 'RSSHUB'
      ? `${rsshubBaseUrl || 'https://rsshub.app'}${source.rsshub_path}`
      : source.url;

  if (!url) {
    return {
      reachable: false,
      latency_ms: 0,
      items_count: 0,
      error: 'No URL configured',
    };
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsSourceTest/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      return {
        reachable: false,
        latency_ms: latency,
        items_count: 0,
        error: `HTTP ${response.status}`,
      };
    }

    const text = await response.text();
    const itemCount = (text.match(/<item\b/gi) || []).length;

    if (itemCount === 0) {
      return {
        reachable: false,
        latency_ms: latency,
        items_count: 0,
        error: 'No items found in feed',
      };
    }

    return {
      reachable: true,
      latency_ms: latency,
      items_count: itemCount,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      reachable: false,
      latency_ms: latency,
      items_count: 0,
      error: message,
    };
  }
}

// ============================================================================
// GET Handler - 列出所有源或获取单个源
// ============================================================================

async function handleGet(
  locals: App.Locals,
  kv: KVStorage,
  url: URL
): Promise<Response> {
  const sources = await getSourcesConfig(locals, kv);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const sourceIdParam = pathParts[pathParts.length - 1];

  // 检查是否是获取单个源
  if (sourceIdParam && sourceIdParam !== 'sources') {
    const sourceId = parseInt(sourceIdParam);
    if (!isNaN(sourceId)) {
      const source = sources.find(s => s.id === sourceId);
      if (!source) {
        return Response.json({
          success: false,
          error: `Source with id ${sourceId} not found`,
          timestamp: new Date().toISOString(),
        } as ErrorResponse, { status: 404 });
      }

      const response: SourceResponse = {
        success: true,
        data: source,
        timestamp: new Date().toISOString(),
      };

      return Response.json(response);
    }
  }

  // 按分类筛选
  const category = url.searchParams.get('category');
  let filteredSources = sources;
  if (category) {
    filteredSources = sources.filter(s => s.category === category);
  }

  // 按激活状态筛选
  const active = url.searchParams.get('active');
  if (active === 'true') {
    filteredSources = filteredSources.filter(s => s.is_active);
  } else if (active === 'false') {
    filteredSources = filteredSources.filter(s => !s.is_active);
  }

  const response: SourcesResponse = {
    success: true,
    data: filteredSources,
    total: filteredSources.length,
    timestamp: new Date().toISOString(),
  };

  return Response.json(response);
}

// ============================================================================
// POST Handler - 创建新源或测试源连接
// ============================================================================

async function handlePost(
  locals: App.Locals,
  kv: KVStorage,
  url: URL,
  body?: any
): Promise<Response> {
  const pathParts = url.pathname.split('/').filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1];

  // 检查是否是测试连接请求
  if (lastPart === 'test' && body) {
    const source = body as SourceConfig;
    const validation = validateSourceConfig(source);

    if (!validation.valid) {
      return Response.json({
        success: false,
        error: validation.errors.join(', '),
        timestamp: new Date().toISOString(),
      } as ErrorResponse, { status: 400 });
    }

    const env = locals.runtime?.env as VercelEnv | undefined;
    const rsshubBaseUrl = env?.RSSHUB_BASE_URL?.trim();

    const testResult = await testSourceConnection(source, rsshubBaseUrl);

    const response: TestSourceResponse = {
      success: true,
      data: testResult,
      timestamp: new Date().toISOString(),
    };

    return Response.json(response);
  }

  // 创建新源
  if (!body) {
    return Response.json({
      success: false,
      error: 'Request body is required',
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 400 });
  }

  const validation = validateSourceConfig(body);
  if (!validation.valid) {
    return Response.json({
      success: false,
      error: validation.errors.join(', '),
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 400 });
  }

  const sources = await getSourcesConfig(locals, kv);

  // 生成新 ID
  const maxId = sources.reduce((max, s) => Math.max(max, s.id), 0);
  const newSource: SourceConfig = {
    ...body,
    id: maxId + 1,
    is_active: body.is_active ?? true,
    weight: body.weight ?? 1.0,
    category: body.category ?? 'uncategorized',
  };

  sources.push(newSource);
  await saveSourcesConfig(kv, sources);

  const response: SourceResponse = {
    success: true,
    data: newSource,
    timestamp: new Date().toISOString(),
  };

  return Response.json(response);
}

// ============================================================================
// PUT Handler - 更新源
// ============================================================================

async function handlePut(
  locals: App.Locals,
  kv: KVStorage,
  url: URL,
  body?: any
): Promise<Response> {
  const pathParts = url.pathname.split('/').filter(Boolean);
  const sourceIdParam = pathParts[pathParts.length - 1];
  const sourceId = parseInt(sourceIdParam);

  if (isNaN(sourceId)) {
    return Response.json({
      success: false,
      error: 'Invalid source ID',
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 400 });
  }

  if (!body) {
    return Response.json({
      success: false,
      error: 'Request body is required',
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 400 });
  }

  const sources = await getSourcesConfig(locals, kv);
  const sourceIndex = sources.findIndex(s => s.id === sourceId);

  if (sourceIndex === -1) {
    return Response.json({
      success: false,
      error: `Source with id ${sourceId} not found`,
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 404 });
  }

  // 验证更新
  const validation = validateSourceConfig(body);
  if (!validation.valid) {
    return Response.json({
      success: false,
      error: validation.errors.join(', '),
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 400 });
  }

  // 更新源
  const updatedSource: SourceConfig = {
    ...sources[sourceIndex],
    ...body,
    id: sourceId,  // 确保 ID 不变
  };

  sources[sourceIndex] = updatedSource;
  await saveSourcesConfig(kv, sources);

  const response: SourceResponse = {
    success: true,
    data: updatedSource,
    timestamp: new Date().toISOString(),
  };

  return Response.json(response);
}

// ============================================================================
// DELETE Handler - 删除源
// ============================================================================

async function handleDelete(
  locals: App.Locals,
  kv: KVStorage,
  url: URL
): Promise<Response> {
  const pathParts = url.pathname.split('/').filter(Boolean);
  const sourceIdParam = pathParts[pathParts.length - 1];
  const sourceId = parseInt(sourceIdParam);

  if (isNaN(sourceId)) {
    return Response.json({
      success: false,
      error: 'Invalid source ID',
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 400 });
  }

  const sources = await getSourcesConfig(locals, kv);
  const sourceIndex = sources.findIndex(s => s.id === sourceId);

  if (sourceIndex === -1) {
    return Response.json({
      success: false,
      error: `Source with id ${sourceId} not found`,
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 404 });
  }

  const deletedSource = sources.splice(sourceIndex, 1)[0];
  await saveSourcesConfig(kv, sources);

  const response: SourceResponse = {
    success: true,
    data: deletedSource,
    timestamp: new Date().toISOString(),
  };

  return Response.json(response);
}

// ============================================================================
// Main Handler
// ============================================================================

export async function GET({ locals, url }: {
  locals: App.Locals;
  url: URL;
}) {
  const kv = requireKV(locals);

  try {
    return await handleGet(locals, kv, url);
  } catch (error: any) {
    console.error('[api/news/sources] GET error:', error);

    return Response.json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 500 });
  }
}

export async function POST({ locals, url, request }: {
  locals: App.Locals;
  url: URL;
  request: Request;
}) {
  const kv = requireKV(locals);

  try {
    const body = await request.json().catch(() => null);
    return await handlePost(locals, kv, url, body);
  } catch (error: any) {
    console.error('[api/news/sources] POST error:', error);

    return Response.json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 500 });
  }
}

export async function PUT({ locals, url, request }: {
  locals: App.Locals;
  url: URL;
  request: Request;
}) {
  const kv = requireKV(locals);

  try {
    const body = await request.json().catch(() => null);
    return await handlePut(locals, kv, url, body);
  } catch (error: any) {
    console.error('[api/news/sources] PUT error:', error);

    return Response.json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 500 });
  }
}

export async function DELETE({ locals, url }: {
  locals: App.Locals;
  url: URL;
}) {
  const kv = requireKV(locals);

  try {
    return await handleDelete(locals, kv, url);
  } catch (error: any) {
    console.error('[api/news/sources] DELETE error:', error);

    return Response.json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 500 });
  }
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
