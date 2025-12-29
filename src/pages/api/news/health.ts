/**
 * News Health Status API
 *
 * GET /api/news/health - 获取系统健康状态
 * POST /api/news/health - 执行健康检查并更新状态
 * POST /api/news/health/reset/:sourceId - 重置指定源的熔断器
 *
 * Query Parameters:
 * - category: (optional) 按分类筛选
 * - force: (optional) 强制重新检查（POST only）
 * - source: (optional) 按源ID筛选
 */

import { requireKV } from '@/lib/env';
import type {
  SourceHealthRecord,
  SystemHealthSummary,
  HealthCheckConfig,
} from '@/modules/news/health-types';
import {
  getSystemHealthSummary,
  getAllHealthRecords,
  checkAllSourcesHealth,
  resetCircuitBreaker,
  buildSystemSummary,
} from '@/modules/news/health-monitor';
import { DEFAULT_HEALTH_CONFIG } from '@/modules/news/health-types';
import { getActiveSources } from '@/modules/intelligence/repository';
import type { IntelligenceSource } from '@/modules/intelligence/types';
import type { KVStorage } from '@/lib/storage/kv';

// ============================================================================
// Types
// ============================================================================

interface HealthResponse {
  success: true;
  data: SystemHealthSummary;
  timestamp: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  timestamp: string;
}

// ============================================================================
// Default Sources Fallback
// ============================================================================

const FALLBACK_SOURCES: IntelligenceSource[] = [
  {
    id: 1,
    name: 'Hacker News',
    url: 'https://news.ycombinator.com/rss',
    strategy: 'DIRECT',
    rsshub_path: null,
    is_active: 1,
    weight: 1.0,
    reliability_score: 1.0,
    category: 'tech',
  },
  {
    id: 2,
    name: 'V2EX',
    url: 'https://www.v2ex.com/index.xml',
    strategy: 'DIRECT',
    rsshub_path: null,
    is_active: 1,
    weight: 1.0,
    reliability_score: 1.0,
    category: 'tech',
  },
  {
    id: 3,
    name: '36氪',
    url: '',
    strategy: 'RSSHUB',
    rsshub_path: '/36kr',
    is_active: 1,
    weight: 1.0,
    reliability_score: 1.0,
    category: 'tech',
  },
  {
    id: 4,
    name: '少数派',
    url: '',
    strategy: 'RSSHUB',
    rsshub_path: '/sspai',
    is_active: 1,
    weight: 1.0,
    reliability_score: 1.0,
    category: 'tech',
  },
  {
    id: 5,
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    strategy: 'DIRECT',
    rsshub_path: null,
    is_active: 1,
    weight: 0.8,
    reliability_score: 1.0,
    category: 'tech',
  },
];

// ============================================================================
// Helpers
// ============================================================================

/**
 * 获取源列表
 */
async function getSources(locals: App.Locals): Promise<IntelligenceSource[]> {
  try {
    const { getIntelligenceDB } = await import('@/lib/env');
    const db = getIntelligenceDB(locals);
    if (db) {
      const sources = await getActiveSources(db);
      if (sources.length > 0) {
        return sources;
      }
    }
  } catch (error) {
    console.warn('[api/news/health] Failed to get sources from database, using fallback:', error);
  }
  return FALLBACK_SOURCES;
}

/**
 * 获取 RSSHub 基础 URL
 */
function getRsshubBaseUrl(locals: App.Locals): string | undefined {
  const env = locals.runtime?.env as VercelEnv | undefined;
  return env?.RSSHUB_BASE_URL?.trim();
}

// ============================================================================
// GET Handler - 获取健康状态
// ============================================================================

async function handleGet(
  kv: KVStorage,
  locals: App.Locals,
  url: URL
): Promise<Response> {
  const category = url.searchParams.get('category');
  const sourceId = url.searchParams.get('source');

  // 尝试从缓存获取
  let summary = await getSystemHealthSummary(kv);

  // 如果没有缓存，从各个源记录构建
  if (!summary) {
    const sources = await getSources(locals);
    const sourceIds = sources.map(s => s.id);

    if (sourceId) {
      const filteredId = parseInt(sourceId);
      if (!sourceIds.includes(filteredId)) {
        sourceIds.length = 0;
        sourceIds.push(filteredId);
      }
    }

    const records = await getAllHealthRecords(kv, sourceIds);
    summary = buildSystemSummary(records);
  }

  // 应用筛选
  if (category || sourceId) {
    let filteredSources = summary.sources;

    if (category) {
      filteredSources = filteredSources.filter(s => s.category === category);
    }

    if (sourceId) {
      const id = parseInt(sourceId);
      filteredSources = filteredSources.filter(s => s.source_id === id);
    }

    // 重新构建摘要
    summary = buildSystemSummary(filteredSources);
  }

  const response: HealthResponse = {
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
  };

  return Response.json(response);
}

// ============================================================================
// POST Handler - 执行健康检查
// ============================================================================

async function handlePost(
  kv: KVStorage,
  locals: App.Locals,
  url: URL
): Promise<Response> {
  const force = url.searchParams.get('force') === 'true';
  const category = url.searchParams.get('category');
  const sourceId = url.searchParams.get('source');

  // 获取源列表
  let sources = await getSources(locals);

  // 应用筛选
  if (category) {
    sources = sources.filter(s => s.category === category);
  }

  if (sourceId) {
    const id = parseInt(sourceId);
    sources = sources.filter(s => s.id === id);
  }

  if (sources.length === 0) {
    return Response.json({
      success: false,
      error: 'No sources found matching the criteria',
      timestamp: new Date().toISOString(),
    } as ErrorResponse, { status: 404 });
  }

  // 执行健康检查
  const rsshubBaseUrl = getRsshubBaseUrl(locals);
  const records = await checkAllSourcesHealth(sources as unknown as Parameters<typeof checkAllSourcesHealth>[0], kv, DEFAULT_HEALTH_CONFIG, rsshubBaseUrl);

  // 构建摘要
  const summary = buildSystemSummary(records);

  const response: HealthResponse = {
    success: true,
    data: summary,
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
    return await handleGet(kv, locals, url);
  } catch (error: any) {
    console.error('[api/news/health] GET error:', error);

    const errorResponse: ErrorResponse = {
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    };

    return Response.json(errorResponse, { status: 500 });
  }
}

export async function POST({ locals, url }: {
  locals: App.Locals;
  url: URL;
}) {
  const kv = requireKV(locals);

  try {
    return await handlePost(kv, locals, url);
  } catch (error: any) {
    console.error('[api/news/health] POST error:', error);

    const errorResponse: ErrorResponse = {
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    };

    return Response.json(errorResponse, { status: 500 });
  }
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
