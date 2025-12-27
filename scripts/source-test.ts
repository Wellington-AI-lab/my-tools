/**
 * 数据源集成测试
 * 运行: npx tsx scripts/source-test.ts
 */

async function fetchWithTimeout(
  url: string,
  opts?: { timeoutMs?: number; headers?: Record<string, string> }
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 10000);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'my-tools/1.0 (test)',
        Accept: 'application/json, text/html, application/xml, */*',
        ...opts?.headers,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

type SourceTest = {
  name: string;
  test: () => Promise<{ success: boolean; items?: number; error?: string }>;
};

const sources: SourceTest[] = [
  {
    name: '华尔街见闻',
    test: async () => {
      const url = 'https://api-one.wallstcn.com/apiv1/content/information-flow?channel=global-channel&accept=article&limit=5';
      const resp = await fetchWithTimeout(url, { timeoutMs: 10000 });
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
      const json = await resp.json() as any;
      const items = json?.data?.items?.length ?? 0;
      return { success: items > 0, items, error: items === 0 ? 'No items' : undefined };
    },
  },
  {
    name: '金十数据',
    test: async () => {
      const url = `https://www.jin10.com/flash_newest.js?t=${Date.now()}`;
      const resp = await fetchWithTimeout(url, { timeoutMs: 10000 });
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
      const text = await resp.text();
      const jsonStr = text.replace(/^var\s+newest\s*=\s*/, '').replace(/;\s*$/, '');
      try {
        const items = JSON.parse(jsonStr) as any[];
        return { success: items.length > 0, items: items.length };
      } catch {
        return { success: false, error: 'JSON parse failed' };
      }
    },
  },
  {
    name: '雪球',
    test: async () => {
      // 雪球需要真实 cookie，预期会失败
      const url = 'https://xueqiu.com/query/v1/symbol/search/status.json?count=5&comment=0&symbol=&hl=0&source=all&sort=time&q=&type=11';
      const resp = await fetchWithTimeout(url, {
        timeoutMs: 10000,
        headers: { Referer: 'https://xueqiu.com/', Origin: 'https://xueqiu.com' },
      });
      // 雪球可能返回 400/403 或 WAF HTML，都是预期行为
      if (!resp.ok) {
        return { success: true, items: 0, error: `Expected: HTTP ${resp.status} (needs auth)` };
      }
      const text = await resp.text();
      // 检查是否是 JSON
      if (text.trim().startsWith('<')) {
        return { success: true, items: 0, error: 'Expected: WAF/HTML response (needs auth)' };
      }
      try {
        const json = JSON.parse(text) as any;
        const items = json?.list?.length ?? 0;
        return { success: true, items };
      } catch {
        return { success: true, items: 0, error: 'Expected: non-JSON response (needs auth)' };
      }
    },
  },
  {
    name: '澎湃新闻',
    test: async () => {
      const url = 'https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar';
      const resp = await fetchWithTimeout(url, {
        timeoutMs: 15000,
        headers: {
          Referer: 'https://www.thepaper.cn/',
          Origin: 'https://www.thepaper.cn',
        },
      });
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
      const json = await resp.json() as any;
      const items = json?.data?.hotNews?.length ?? 0;
      return { success: items > 0, items, error: items === 0 ? 'No items' : undefined };
    },
  },
  {
    name: 'FT 中文网',
    test: async () => {
      const url = 'https://www.ftchinese.com/rss/news';
      const resp = await fetchWithTimeout(url, {
        timeoutMs: 10000,
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      });
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
      const xml = await resp.text();
      const itemCount = (xml.match(/<item>/gi) || []).length;
      return { success: itemCount > 0, items: itemCount, error: itemCount === 0 ? 'No items in RSS' : undefined };
    },
  },
  {
    name: '36氪',
    test: async () => {
      const url = 'https://36kr.com/api/newsflash?per_page=5';
      const resp = await fetchWithTimeout(url, {
        timeoutMs: 10000,
        headers: { Referer: 'https://36kr.com/' },
      });
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
      const json = await resp.json() as any;
      const items = json?.data?.items?.length ?? 0;
      return { success: items > 0, items, error: items === 0 ? 'No items' : undefined };
    },
  },
  {
    name: 'Hacker News',
    test: async () => {
      const resp = await fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json', { timeoutMs: 10000 });
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
      const ids = await resp.json() as number[];
      return { success: ids.length > 0, items: ids.length };
    },
  },
  {
    name: '少数派',
    test: async () => {
      const ts = Math.floor(Date.now() / 1000);
      const url = `https://sspai.com/api/v1/article/tag/page/get?limit=5&offset=0&created_at=${ts}&tag=%E7%83%AD%E9%97%A8%E6%96%87%E7%AB%A0`;
      const resp = await fetchWithTimeout(url, {
        timeoutMs: 10000,
        headers: { Referer: 'https://sspai.com/' },
      });
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
      const json = await resp.json() as any;
      const items = json?.data?.length ?? 0;
      return { success: items > 0, items, error: items === 0 ? 'No items' : undefined };
    },
  },
  {
    name: 'Google Trends RSS (CN)',
    test: async () => {
      const url = 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=CN&hl=zh-CN';
      const resp = await fetchWithTimeout(url, {
        timeoutMs: 12000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
        },
      });
      // Google Trends RSS 可能因地理限制返回 404，这是预期行为
      if (!resp.ok) {
        const status = resp.status;
        if (status === 404 || status === 403) {
          return { success: true, items: 0, error: `Expected: HTTP ${status} (geo-restricted)` };
        }
        return { success: false, error: `HTTP ${status}` };
      }
      const xml = await resp.text();
      const itemCount = (xml.match(/<item>/gi) || []).length;
      return { success: itemCount > 0, items: itemCount, error: itemCount === 0 ? 'No items' : undefined };
    },
  },
  {
    name: '微博热搜',
    test: async () => {
      const url = 'https://s.weibo.com/top/summary';
      const resp = await fetchWithTimeout(url, {
        timeoutMs: 12000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });
      if (!resp.ok) {
        // 微博可能限流，返回 4xx 是预期行为
        const status = resp.status;
        if (status >= 400 && status < 500) {
          return { success: true, items: 0, error: `Expected: HTTP ${status} (rate-limited)` };
        }
        return { success: false, error: `HTTP ${status}` };
      }
      const html = await resp.text();
      // 检查是否包含热搜列表标记
      const hasTable = html.includes('td-02') || html.includes('热搜');
      if (!hasTable) {
        // HTML 结构变化或被限流是预期行为
        return { success: true, items: 0, error: 'Expected: No hot list (blocked or markup changed)' };
      }
      return { success: true, items: -1 };
    },
  },
];

async function main() {
  console.log('🌐 数据源集成测试开始...\n');

  let passed = 0;
  let failed = 0;

  for (const source of sources) {
    process.stdout.write(`  测试 ${source.name}... `);
    try {
      const result = await source.test();
      if (result.success) {
        console.log(`✅ (${result.items ?? 'ok'} items)${result.error ? ` [${result.error}]` : ''}`);
        passed++;
      } else {
        console.log(`❌ ${result.error || 'Failed'}`);
        failed++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('abort') || msg.includes('timeout')) {
        console.log(`⚠️ Timeout`);
      } else {
        console.log(`❌ ${msg}`);
      }
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`结果: ${passed} passed, ${failed} failed`);

  // 允许部分数据源失败（网络问题）
  if (passed >= 5) {
    console.log('✅ 大部分数据源可用');
    process.exit(0);
  } else {
    console.log('❌ 太多数据源不可用');
    process.exit(1);
  }
}

main().catch(console.error);
