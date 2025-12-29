/**
 * 新闻聚合 API Worker
 * 功能: 接收爬虫数据，提供给前端读取
 * 支持: 分页加载 + PWA 前端托管
 */

import { Hono } from 'hono';

// 定义环境变量类型
type Env = {
  DB: D1Database;
  API_SECRET: string;
  ALLOWED_ORIGINS: string;
};

// 前端静态文件内容 (从 fetcher 目录读取)
// 注意：部署时需要将 fetcher 目录的内容打包到 Worker 中
const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vibe Tech News - 重定向</title>
    <script>
        // 重定向到主站点
        window.location.href = 'https://my-tools-bim.pages.dev/tools/news';
    </script>
</head>
<body>
    <p>正在跳转到 Vibe Tech News...</p>
</body>
</html>
`;

const MANIFEST = {
  "name": "Vibe Tech News",
  "short_name": "VibeNews",
  "description": "每日聚合 HackerNews、V2EX、36氪等全球科技资讯，AI 智能摘要",
  "start_url": "/tools/news",
  "display": "standalone",
  "background_color": "#f5f5f7",
  "theme_color": "#0071e3",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "https://my-tools-bim.pages.dev/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "https://my-tools-bim.pages.dev/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "categories": ["news", "technology"],
  "lang": "zh-CN",
  "scope": "/tools/news"
};

const SW_CONTENT = `
// Vibe Tech News - Service Worker
const VERSION = 'v1.0.1';
const CACHE_PREFIX = 'vibe-news';
const CACHE_NAMES = {
  SHELL: \`\${CACHE_PREFIX}-shell-\${VERSION}\`,
  API: \`\${CACHE_PREFIX}-api-\${VERSION}\`,
  ASSETS: \`\${CACHE_PREFIX}-assets-\${VERSION}\`
};

self.addEventListener('install', (e) => {
  console.log('[SW] Installing:', VERSION);
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  console.log('[SW] Activating:', VERSION);
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith(CACHE_PREFIX) && !Object.values(CACHE_NAMES).includes(k))
         .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API 请求 - Network First
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(e.request, CACHE_NAMES.API));
    return;
  }

  // 其他请求 - Network First, fallback to cache
  e.respondWith(networkFirst(e.request, CACHE_NAMES.SHELL));
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}
`;

const app = new Hono<{ Bindings: Env }>();

// ============================================
// CORS 中间件
// ============================================
app.use('*', async (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS
    ? c.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['*'];

  const requestOrigin = c.req.header('Origin');
  const origin = allowedOrigins.some(allowed =>
    allowed === '*' ||
    allowed === requestOrigin ||
    (allowed.endsWith('/*') && requestOrigin?.startsWith(allowed.slice(0, -1)))
  ) ? (requestOrigin ?? '*') : allowedOrigins[0];

  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
});

// ============================================
// PWA 静态文件路由
// ============================================

// 重定向到主站点
app.get('/', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8');
  return c.body(HTML_CONTENT);
});

// manifest.json
app.get('/manifest.json', (c) => {
  c.header('Content-Type', 'application/json');
  c.header('Access-Control-Allow-Origin', '*');
  return c.json(MANIFEST);
});

// sw.js
app.get('/sw.js', (c) => {
  c.header('Content-Type', 'application/javascript');
  c.header('Service-Worker-Allowed', '/');
  return c.body(SW_CONTENT);
});

// ============================================
// API 路由
// ============================================

/**
 * GET /stats - 获取统计信息
 */
app.get('/stats', async (c) => {
  try {
    const [totalResult, sourceStats, latestResult] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as count FROM articles').first(),
      c.env.DB.prepare(`
        SELECT source, COUNT(*) as count
        FROM articles
        GROUP BY source
        ORDER BY count DESC
      `).all(),
      c.env.DB.prepare(`
        SELECT created_at
        FROM articles
        ORDER BY created_at DESC
        LIMIT 1
      `).first()
    ]);

    return c.json({
      success: true,
      totalArticles: (totalResult?.count as number) ?? 0,
      bySource: sourceStats.results ?? [],
      latestArticleAt: latestResult?.created_at ?? null
    });

  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /latest - 获取最新文章
 */
app.get('/latest', async (c) => {
  try {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
    const limit = Math.min(100, parseInt(c.req.query('limit') || '50', 10) || 50);
    const offset = (page - 1) * limit;

    const { results } = await c.env.DB.prepare(`
      SELECT id, title, url, source, summary, created_at, external_id
      FROM articles
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return c.json({
      success: true,
      count: results.length,
      page: page,
      limit: limit,
      hasMore: results.length === limit,
      data: results
    });

  } catch (error) {
    console.error('Get latest articles error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /add - 添加新闻文章
 */
app.post('/add', async (c) => {
  const apiKey = c.req.header('x-api-key');
  if (apiKey !== c.env.API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const articles = await c.req.json();

    if (!Array.isArray(articles)) {
      return c.json({ error: 'Request body must be an array' }, 400);
    }

    const MAX_ARTICLES_PER_REQUEST = 1000;
    if (articles.length > MAX_ARTICLES_PER_REQUEST) {
      return c.json({
        error: `Maximum ${MAX_ARTICLES_PER_REQUEST} articles per request`,
        limit: MAX_ARTICLES_PER_REQUEST
      }, 413);
    }

    const validArticles = articles.filter(article =>
      article?.title &&
      article?.url &&
      article?.source &&
      article?.external_id
    );

    if (validArticles.length === 0) {
      return c.json({
        success: true,
        inserted: 0,
        skipped: articles.length
      });
    }

    const results = await Promise.all(
      validArticles.map(article => {
        const stmt = c.env.DB.prepare(`
          INSERT OR IGNORE INTO articles (title, url, source, summary, created_at, external_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        return stmt.bind(
          article.title,
          article.url,
          article.source,
          article.summary ?? '',
          article.created_at ?? Math.floor(Date.now() / 1000),
          article.external_id
        ).run();
      })
    );

    const successCount = results.filter(r => r.meta.changes > 0).length;
    const skippedCount = results.length - successCount + (articles.length - validArticles.length);

    return c.json({
      success: true,
      inserted: successCount,
      skipped: skippedCount
    });

  } catch (error) {
    console.error('Add articles error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
