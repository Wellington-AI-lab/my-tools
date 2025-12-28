/**
 * Test Tag Normalization API
 * 验证 TAG_ALIAS_MAP 和 VALID_TAGS 是否正确工作
 */

import { VALID_TAGS, TAG_ALIAS_MAP, normalizeSingleTag } from '@/modules/trends/core/tag-taxonomy';

export const prerender = false;

export async function GET() {
  // Test single character mappings that were recently added
  const testCases = [
    { input: '中', expected: '中国' },
    { input: '美', expected: '美国' },
    { input: '日', expected: '日本' },
    { input: '泰', expected: '泰国' },
    { input: '柬', expected: '柬埔寨' },
    { input: '俄', expected: '俄罗斯' },
    { input: '乌', expected: '乌克兰' },
    { input: '以', expected: '以色列' },
    { input: 'Trump', expected: null }, // Not in whitelist
    { input: '特朗普', expected: '特朗普' }, // Should be in whitelist
  ];

  const results = testCases.map(({ input, expected }) => {
    const normalized = normalizeSingleTag(input);
    const passed = normalized === expected;
    return { input, expected, actual: normalized, passed };
  });

  // Also check raw TAG_ALIAS_MAP
  const aliasMapSamples = {
    '中': TAG_ALIAS_MAP['中'],
    '美': TAG_ALIAS_MAP['美'],
    'cn': TAG_ALIAS_MAP['cn'],
    'us': TAG_ALIAS_MAP['us'],
  };

  // Check VALID_TAGS count
  const validTagsCount = VALID_TAGS.size;

  return Response.json({
    validTagsCount,
    aliasMapSamples,
    testResults: results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
    },
  });
}
