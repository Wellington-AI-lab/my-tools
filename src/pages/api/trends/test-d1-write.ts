/**
 * D1 Write Test API
 * 测试 D1 dropped_tags 表写入功能
 */

import { requireD1 } from '@/lib/env';

export const prerender = false;

export async function GET({ locals }: { locals: App.Locals }) {
  const d1 = requireD1(locals);

  const testTag = {
    original: 'test_' + Date.now(),
    normalized: 'test',
    reason: 'NOT_IN_WHITELIST' as const,
  };

  try {
    const result = await d1
      .prepare(`
        INSERT INTO dropped_tags (original_tag, normalized_tag, reason, created_at, scan_id)
        VALUES (?, ?, ?, datetime('now'), ?)
      `)
      .bind(testTag.original, testTag.normalized, testTag.reason, 'test_scan')
      .run();

    // Verify write by reading back
    const verify = await d1
      .prepare(`SELECT * FROM dropped_tags WHERE original_tag = ?`)
      .bind(testTag.original)
      .first();

    return Response.json({
      success: true,
      testTag,
      writeResult: {
        success: result.success,
        changes: result.meta?.changes,
        lastRowId: result.meta?.last_row_id,
      },
      verifyResult: verify,
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
