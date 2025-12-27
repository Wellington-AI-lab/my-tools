/**
 * 深度测试脚本 - 验证 Trend Radar 和信息流模块
 * 运行: npx tsx scripts/deep-test.ts
 */

// ====== 测试 Jin10 日期解析 ======
function testJin10DateParsing() {
  console.log('\n=== 测试 Jin10 日期解析 ===');

  const testCases = [
    { input: '20241227 10:30:00', expected: '2024-12-27T10:30:00+08:00' },
    { input: '20240101 00:00:00', expected: '2024-01-01T00:00:00+08:00' },
    { input: '', expected: undefined },
    { input: 'invalid', expected: undefined },
    { input: '2024122', expected: undefined }, // 太短
    { input: '20241227', expected: undefined }, // 缺少时间
    { input: '2024-12-27 10:30:00', expected: undefined }, // 错误格式
  ];

  let passed = 0;
  let failed = 0;

  for (const { input, expected } of testCases) {
    const timeMatch = input.match(/^(\d{4})(\d{2})(\d{2}) (\d{2}:\d{2}:\d{2})$/);
    const result = timeMatch
      ? `${timeMatch[1]}-${timeMatch[2]}-${timeMatch[3]}T${timeMatch[4]}+08:00`
      : undefined;

    if (result === expected) {
      console.log(`  ✅ "${input}" => ${result}`);
      passed++;
    } else {
      console.log(`  ❌ "${input}" => ${result} (expected: ${expected})`);
      failed++;
    }
  }

  console.log(`  结果: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ====== 测试 HTML 实体解码 ======
function testHtmlEntityDecode() {
  console.log('\n=== 测试 HTML 实体解码 ===');

  function decodeHtmlEntities(s: string): string {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  }

  const testCases = [
    { input: 'Hello &amp; World', expected: 'Hello & World' },
    { input: '&lt;script&gt;', expected: '<script>' },
    { input: '&#60;&#62;', expected: '<>' },
    { input: '&#8220;quote&#8221;', expected: '\u201Cquote\u201D' }, // Unicode curly quotes
    { input: 'no entities', expected: 'no entities' },
    { input: '&nbsp;&nbsp;', expected: '  ' },
  ];

  let passed = 0;
  let failed = 0;

  for (const { input, expected } of testCases) {
    const result = decodeHtmlEntities(input);
    if (result === expected) {
      console.log(`  ✅ "${input}" => "${result}"`);
      passed++;
    } else {
      console.log(`  ❌ "${input}" => "${result}" (expected: "${expected}")`);
      failed++;
    }
  }

  console.log(`  结果: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ====== 测试 dayKeyShanghai ======
function testDayKeyShanghai() {
  console.log('\n=== 测试 dayKeyShanghai ===');

  function dayKeyShanghai(d = new Date()): string {
    const sh = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    return sh.toISOString().slice(0, 10);
  }

  const testCases = [
    // UTC 2024-12-27 16:00 => Shanghai 2024-12-28 00:00
    { input: new Date('2024-12-27T16:00:00Z'), expected: '2024-12-28' },
    // UTC 2024-12-27 08:00 => Shanghai 2024-12-27 16:00
    { input: new Date('2024-12-27T08:00:00Z'), expected: '2024-12-27' },
    // UTC 2024-01-01 00:00 => Shanghai 2024-01-01 08:00
    { input: new Date('2024-01-01T00:00:00Z'), expected: '2024-01-01' },
  ];

  let passed = 0;
  let failed = 0;

  for (const { input, expected } of testCases) {
    const result = dayKeyShanghai(input);
    if (result === expected) {
      console.log(`  ✅ ${input.toISOString()} => ${result}`);
      passed++;
    } else {
      console.log(`  ❌ ${input.toISOString()} => ${result} (expected: ${expected})`);
      failed++;
    }
  }

  console.log(`  结果: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ====== 测试 bigrams 和 jaccard ======
function testBigramsAndJaccard() {
  console.log('\n=== 测试 bigrams 和 jaccard ===');

  function normalizeText(s: string): string {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, '');
  }

  function bigrams(s: string): Set<string> {
    const t = normalizeText(s);
    const grams = new Set<string>();
    if (!t) return grams;
    if (t.length === 1) {
      grams.add(t);
      return grams;
    }
    for (let i = 0; i < t.length - 1; i++) grams.add(t.slice(i, i + 2));
    return grams;
  }

  function jaccard(a: Set<string>, b: Set<string>): number {
    if (!a.size && !b.size) return 1;
    if (!a.size || !b.size) return 0;
    let inter = 0;
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    for (const x of small) if (large.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union > 0 ? inter / union : 0;
  }

  let passed = 0;
  let failed = 0;

  // Test bigrams
  const bg1 = bigrams('hello');
  if (bg1.size === 4 && bg1.has('he') && bg1.has('el') && bg1.has('ll') && bg1.has('lo')) {
    console.log('  ✅ bigrams("hello") correct');
    passed++;
  } else {
    console.log(`  ❌ bigrams("hello") = ${JSON.stringify([...bg1])}`);
    failed++;
  }

  const bg2 = bigrams('');
  if (bg2.size === 0) {
    console.log('  ✅ bigrams("") correct');
    passed++;
  } else {
    console.log(`  ❌ bigrams("") = ${JSON.stringify([...bg2])}`);
    failed++;
  }

  const bg3 = bigrams('a');
  if (bg3.size === 1 && bg3.has('a')) {
    console.log('  ✅ bigrams("a") correct');
    passed++;
  } else {
    console.log(`  ❌ bigrams("a") = ${JSON.stringify([...bg3])}`);
    failed++;
  }

  // Test jaccard
  const j1 = jaccard(bigrams('hello'), bigrams('hello'));
  if (j1 === 1) {
    console.log('  ✅ jaccard("hello", "hello") = 1');
    passed++;
  } else {
    console.log(`  ❌ jaccard("hello", "hello") = ${j1}`);
    failed++;
  }

  const j2 = jaccard(bigrams('hello'), bigrams(''));
  if (j2 === 0) {
    console.log('  ✅ jaccard("hello", "") = 0');
    passed++;
  } else {
    console.log(`  ❌ jaccard("hello", "") = ${j2}`);
    failed++;
  }

  const j3 = jaccard(new Set(), new Set());
  if (j3 === 1) {
    console.log('  ✅ jaccard(empty, empty) = 1');
    passed++;
  } else {
    console.log(`  ❌ jaccard(empty, empty) = ${j3}`);
    failed++;
  }

  console.log(`  结果: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ====== 测试 escapeHtml ======
function testEscapeHtml() {
  console.log('\n=== 测试 escapeHtml ===');

  function escapeHtml(s: string) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const testCases = [
    { input: '<script>alert("xss")</script>', expected: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;' },
    { input: "a'b", expected: 'a&#039;b' },
    { input: 'a&b', expected: 'a&amp;b' },
    { input: '', expected: '' },
    { input: null as unknown as string, expected: '' },
    { input: undefined as unknown as string, expected: '' },
  ];

  let passed = 0;
  let failed = 0;

  for (const { input, expected } of testCases) {
    const result = escapeHtml(input);
    if (result === expected) {
      console.log(`  ✅ "${input}" => "${result}"`);
      passed++;
    } else {
      console.log(`  ❌ "${input}" => "${result}" (expected: "${expected}")`);
      failed++;
    }
  }

  console.log(`  结果: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ====== 测试 stableId ======
function testStableId() {
  console.log('\n=== 测试 stableId ===');

  function stableId(input: string): string {
    const base = String(input || '').slice(0, 256);
    let h = 2166136261;
    for (let i = 0; i < base.length; i++) {
      h ^= base.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  let passed = 0;
  let failed = 0;

  // Same input should produce same output
  const id1 = stableId('test');
  const id2 = stableId('test');
  if (id1 === id2) {
    console.log(`  ✅ stableId("test") is stable: ${id1}`);
    passed++;
  } else {
    console.log(`  ❌ stableId("test") not stable: ${id1} vs ${id2}`);
    failed++;
  }

  // Different input should (usually) produce different output
  const id3 = stableId('test1');
  const id4 = stableId('test2');
  if (id3 !== id4) {
    console.log(`  ✅ stableId("test1") !== stableId("test2")`);
    passed++;
  } else {
    console.log(`  ❌ stableId("test1") === stableId("test2")`);
    failed++;
  }

  // Empty string
  const id5 = stableId('');
  if (typeof id5 === 'string' && id5.length > 0) {
    console.log(`  ✅ stableId("") = ${id5}`);
    passed++;
  } else {
    console.log(`  ❌ stableId("") failed`);
    failed++;
  }

  // Long string should be truncated
  const longStr = 'x'.repeat(500);
  const id6 = stableId(longStr);
  if (typeof id6 === 'string' && id6.length > 0) {
    console.log(`  ✅ stableId(500 chars) = ${id6}`);
    passed++;
  } else {
    console.log(`  ❌ stableId(500 chars) failed`);
    failed++;
  }

  console.log(`  结果: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ====== 测试 RSS 解析边界情况 ======
function testRssParsing() {
  console.log('\n=== 测试 RSS 解析边界情况 ===');

  function stripCdata(s: string): string {
    return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
  }

  function decodeXmlEntities(s: string): string {
    return s
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'");
  }

  let passed = 0;
  let failed = 0;

  // Test CDATA stripping
  const cdata1 = stripCdata('<![CDATA[Hello World]]>');
  if (cdata1 === 'Hello World') {
    console.log('  ✅ stripCdata with CDATA works');
    passed++;
  } else {
    console.log(`  ❌ stripCdata: ${cdata1}`);
    failed++;
  }

  const cdata2 = stripCdata('No CDATA here');
  if (cdata2 === 'No CDATA here') {
    console.log('  ✅ stripCdata without CDATA works');
    passed++;
  } else {
    console.log(`  ❌ stripCdata without CDATA: ${cdata2}`);
    failed++;
  }

  // Test XML entity decoding
  const xml1 = decodeXmlEntities('&lt;tag&gt;');
  if (xml1 === '<tag>') {
    console.log('  ✅ decodeXmlEntities works');
    passed++;
  } else {
    console.log(`  ❌ decodeXmlEntities: ${xml1}`);
    failed++;
  }

  console.log(`  结果: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ====== 测试 URL 构建 ======
function testUrlConstruction() {
  console.log('\n=== 测试 URL 构建 ===');

  let passed = 0;
  let failed = 0;

  // Test Weibo URL construction
  const weiboHref1 = '/weibo?q=test';
  const weiboUrl1 = weiboHref1.startsWith('http') ? weiboHref1 : `https://s.weibo.com${weiboHref1}`;
  if (weiboUrl1 === 'https://s.weibo.com/weibo?q=test') {
    console.log('  ✅ Weibo relative URL');
    passed++;
  } else {
    console.log(`  ❌ Weibo relative URL: ${weiboUrl1}`);
    failed++;
  }

  const weiboHref2 = 'https://weibo.com/123';
  const weiboUrl2 = weiboHref2.startsWith('http') ? weiboHref2 : `https://s.weibo.com${weiboHref2}`;
  if (weiboUrl2 === 'https://weibo.com/123') {
    console.log('  ✅ Weibo absolute URL');
    passed++;
  } else {
    console.log(`  ❌ Weibo absolute URL: ${weiboUrl2}`);
    failed++;
  }

  console.log(`  结果: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ====== 测试常量时间比较 ======
function testConstantTimeCompare() {
  console.log('\n=== 测试常量时间比较 ===');

  function verifyKey(input: string, expected: string): boolean {
    if (input.length !== expected.length) return false;
    let result = 0;
    for (let i = 0; i < input.length; i++) {
      result |= input.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return result === 0;
  }

  let passed = 0;
  let failed = 0;

  // Same keys
  if (verifyKey('secret123', 'secret123') === true) {
    console.log('  ✅ Same keys match');
    passed++;
  } else {
    console.log('  ❌ Same keys should match');
    failed++;
  }

  // Different keys
  if (verifyKey('secret123', 'secret456') === false) {
    console.log('  ✅ Different keys do not match');
    passed++;
  } else {
    console.log('  ❌ Different keys should not match');
    failed++;
  }

  // Different lengths
  if (verifyKey('short', 'longer') === false) {
    console.log('  ✅ Different length keys do not match');
    passed++;
  } else {
    console.log('  ❌ Different length keys should not match');
    failed++;
  }

  // Empty strings
  if (verifyKey('', '') === true) {
    console.log('  ✅ Empty strings match');
    passed++;
  } else {
    console.log('  ❌ Empty strings should match');
    failed++;
  }

  console.log(`  结果: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ====== 主函数 ======
async function main() {
  console.log('🧪 深度测试开始...\n');

  const results = [
    testJin10DateParsing(),
    testHtmlEntityDecode(),
    testDayKeyShanghai(),
    testBigramsAndJaccard(),
    testEscapeHtml(),
    testStableId(),
    testRssParsing(),
    testUrlConstruction(),
    testConstantTimeCompare(),
  ];

  const allPassed = results.every(Boolean);

  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('✅ 所有测试通过!');
  } else {
    console.log('❌ 部分测试失败，请检查上述输出');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
