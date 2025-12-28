/**
 * Batch D1 Write Test
 * 测试批量写入 dropped_tags
 */

import { requireD1 } from '@/lib/env';

export const prerender = false;

export async function GET({ locals }: { locals: App.Locals }) {
  const d1 = requireD1(locals);

  // Create test batch
  const batchSize = 10;
  const testTags = Array.from({ length: batchSize }, (_, i) => ({
    original: `test_batch_${Date.now()}_${i}`,
    normalized: `test_${i}`,
    reason: 'NOT_IN_WHITELIST' as const,
  }));

  try {
    const createdAt = new Date().toISOString();
    const scanId = `test_batch_${Date.now()}`;

    // Build batch insert
    const placeholders = testTags.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const values = testTags.flatMap(t => [
      t.original,
      t.normalized,
      t.reason,
      createdAt,
      scanId,
    ]);

    const result = await d1
      .prepare(`
        INSERT INTO dropped_tags (original_tag, normalized_tag, reason, created_at, scan_id)
        VALUES ${placeholders}
      `)
      .bind(...values)
      .run();

    // Verify
    const countResult = await d1
      .prepare(`SELECT COUNT(*) as c FROM dropped_tags WHERE scan_id = ?`)
      .bind(scanId)
      .first<{ c: number }>();

    return Response.json({
      success: true,
      batchSize,
      writeResult: {
        changes: result.meta?.changes,
        lastRowId: result.meta?.last_row_id,
      },
      verifyCount: countResult?.c,
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
