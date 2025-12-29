/**
 * Intelligence Sources Management API
 *
 * 数据源 CRUD 管理接口
 *
 * GET    - 获取所有数据源列表
 * POST   - 创建新数据源
 * PATCH  - 更新数据源（通过 ID）
 * DELETE - 删除数据源（通过 ID）
 */

import { requireIntelligenceDB, type Database } from '@/lib/env';
import {
  getAllSources,
  getSourceById,
  createSource,
  updateSource,
  deleteSource,
  getSourceStats,
} from '@/modules/intelligence/repository';
import type { CreateSourceInput, UpdateSourceInput } from '@/modules/intelligence/types';

// 成功响应类型
interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

// 错误响应类型
interface ErrorResponse {
  success: false;
  error: string;
}

/**
 * GET - 获取数据源列表或单个数据源
 */
async function handleGet(
  db: Database,
  url: URL
): Promise<Response> {
  const id = url.searchParams.get('id');
  const stats = url.searchParams.get('stats') === 'true';

  // 获取统计信息
  if (stats) {
    const statsData = await getSourceStats(db);
    return Response.json({
      success: true,
      data: statsData,
    } as SuccessResponse);
  }

  // 获取单个数据源
  if (id) {
    const sourceId = parseInt(id);
    if (isNaN(sourceId)) {
      return Response.json({
        success: false,
        error: 'Invalid source ID',
      } as ErrorResponse, { status: 400 });
    }

    const source = await getSourceById(db, sourceId);
    if (!source) {
      return Response.json({
        success: false,
        error: `Source ${sourceId} not found`,
      } as ErrorResponse, { status: 404 });
    }

    return Response.json({
      success: true,
      data: source,
    } as SuccessResponse);
  }

  // 获取所有数据源
  const sources = await getAllSources(db);
  return Response.json({
    success: true,
    data: sources,
  } as SuccessResponse);
}

/**
 * POST - 创建新数据源
 */
async function handlePost(
  db: Database,
  body: any
): Promise<Response> {
  // 验证必填字段
  if (!body.name || !body.url || !body.strategy) {
    return Response.json({
      success: false,
      error: 'Missing required fields: name, url, strategy',
    } as ErrorResponse, { status: 400 });
  }

  // 验证 strategy
  if (body.strategy !== 'DIRECT' && body.strategy !== 'RSSHUB') {
    return Response.json({
      success: false,
      error: 'Invalid strategy. Must be "DIRECT" or "RSSHUB"',
    } as ErrorResponse, { status: 400 });
  }

  // RSSHUB 策略需要 rsshub_path
  if (body.strategy === 'RSSHUB' && !body.rsshub_path) {
    return Response.json({
      success: false,
      error: 'RSSHUB strategy requires rsshub_path',
    } as ErrorResponse, { status: 400 });
  }

  const input: CreateSourceInput = {
    name: body.name,
    url: body.url,
    strategy: body.strategy,
    rsshub_path: body.rsshub_path,
    category: body.category,
    weight: body.weight,
    logic_filter: body.logic_filter,
    is_active: body.is_active,
  };

  try {
    const source = await createSource(db, input);
    return Response.json({
      success: true,
      data: source,
    } as SuccessResponse, { status: 201 });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to create source',
    } as ErrorResponse, { status: 500 });
  }
}

/**
 * PATCH - 更新数据源
 */
async function handlePatch(
  db: Database,
  body: any
): Promise<Response> {
  const id = body.id;
  if (!id) {
    return Response.json({
      success: false,
      error: 'Missing required field: id',
    } as ErrorResponse, { status: 400 });
  }

  const sourceId = parseInt(id);
  if (isNaN(sourceId)) {
    return Response.json({
      success: false,
      error: 'Invalid source ID',
    } as ErrorResponse, { status: 400 });
  }

  // 验证 strategy（如果提供）
  if (body.strategy && body.strategy !== 'DIRECT' && body.strategy !== 'RSSHUB') {
    return Response.json({
      success: false,
      error: 'Invalid strategy. Must be "DIRECT" or "RSSHUB"',
    } as ErrorResponse, { status: 400 });
  }

  const input: UpdateSourceInput = {
    name: body.name,
    url: body.url,
    strategy: body.strategy,
    rsshub_path: body.rsshub_path,
    category: body.category,
    weight: body.weight,
    logic_filter: body.logic_filter,
    is_active: body.is_active,
    reliability_score: body.reliability_score,
  };

  try {
    const source = await updateSource(db, sourceId, input);
    if (!source) {
      return Response.json({
        success: false,
        error: `Source ${sourceId} not found`,
      } as ErrorResponse, { status: 404 });
    }

    return Response.json({
      success: true,
      data: source,
    } as SuccessResponse);
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to update source',
    } as ErrorResponse, { status: 500 });
  }
}

/**
 * DELETE - 删除数据源
 */
async function handleDelete(
  db: Database,
  url: URL
): Promise<Response> {
  const id = url.searchParams.get('id');
  if (!id) {
    return Response.json({
      success: false,
      error: 'Missing required parameter: id',
    } as ErrorResponse, { status: 400 });
  }

  const sourceId = parseInt(id);
  if (isNaN(sourceId)) {
    return Response.json({
      success: false,
      error: 'Invalid source ID',
    } as ErrorResponse, { status: 400 });
  }

  const deleted = await deleteSource(db, sourceId);
  if (!deleted) {
    return Response.json({
      success: false,
      error: `Source ${sourceId} not found`,
    } as ErrorResponse, { status: 404 });
  }

  return Response.json({
    success: true,
    data: { deleted: true, id: sourceId },
  } as SuccessResponse);
}

/**
 * 主路由处理
 */
export async function GET({ locals, url }: {
  locals: App.Locals;
  url: URL;
}) {
  try {
    const db = requireIntelligenceDB(locals);
    return handleGet(db, url);
  } catch (err: any) {
    return Response.json({
      success: false,
      error: err?.message || 'Database not available',
    } as ErrorResponse, { status: 500 });
  }
}

export async function POST({ locals, request }: {
  locals: App.Locals;
  request: Request;
}) {
  try {
    const db = requireIntelligenceDB(locals);
    const body = await request.json().catch(() => ({}));
    return handlePost(db, body);
  } catch (err: any) {
    return Response.json({
      success: false,
      error: err?.message || 'Database not available',
    } as ErrorResponse, { status: 500 });
  }
}

export async function PATCH({ locals, request }: {
  locals: App.Locals;
  request: Request;
}) {
  try {
    const db = requireIntelligenceDB(locals);
    const body = await request.json().catch(() => ({}));
    return handlePatch(db, body);
  } catch (err: any) {
    return Response.json({
      success: false,
      error: err?.message || 'Database not available',
    } as ErrorResponse, { status: 500 });
  }
}

export async function DELETE({ locals, url }: {
  locals: App.Locals;
  url: URL;
}) {
  try {
    const db = requireIntelligenceDB(locals);
    return handleDelete(db, url);
  } catch (err: any) {
    return Response.json({
      success: false,
      error: err?.message || 'Database not available',
    } as ErrorResponse, { status: 500 });
  }
}
