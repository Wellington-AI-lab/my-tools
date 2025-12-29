/**
 * 新闻聚合 API Worker
 * 功能: 接收爬虫数据，提供给前端读取
 * 支持: 分页加载 + PWA 前端托管 + 每日早报邮件 + 语义去重
 */

import { Hono } from 'hono';

// ============================================
// 类型定义
// ============================================
type Env = {
  DB: D1Database;
  API_SECRET: string;
  ALLOWED_ORIGINS: string;
  RESEND_API_KEY: string;
  DIGEST_FROM: string;
  DIGEST_TO: string;
  AI: Ai;
  VECTORS: VectorizeIndex;
};

interface Article {
  id?: number;
  title: string;
  url: string;
  source: string;
  summary: string;
  created_at?: number;
  external_id?: string;
}

interface StructuredSummary {
  score?: number;
  tags?: string[];
  key_points?: string[];
}

interface DedupResult {
  isDuplicate: boolean;
  similarity?: number;
  existingId?: number;
}

interface AddResult {
  success: boolean;
  inserted: number;
  skipped: number;
  duplicates?: Array<{ title: string; similarity: number }>;
}

// ============================================
// 常量配置
// ============================================
const SIMILARITY_THRESHOLD = 0.85; // 相似度阈值
const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';
const EMBEDDING_DIMENSIONS = 384;

// ============================================
// 前端静态文件
// ============================================
const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vibe Tech News - 重定向</title>
    <script>
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
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(e.request, CACHE_NAMES.API));
    return;
  }
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
app.get('/', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8');
  return c.body(HTML_CONTENT);
});

app.get('/manifest.json', (c) => {
  c.header('Content-Type', 'application/json');
  c.header('Access-Control-Allow-Origin', '*');
  return c.json(MANIFEST);
});

app.get('/sw.js', (c) => {
  c.header('Content-Type', 'application/javascript');
  c.header('Service-Worker-Allowed', '/');
  return c.body(SW_CONTENT);
});

// ============================================
// API 路由
// ============================================
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

// ============================================
// POST /add - 添加新闻（带语义去重）
// ============================================
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

    // 过滤有效文章
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

    // 处理每篇文章（去重 + 写入）
    const result = await processArticlesWithDedup(c.env, validArticles);

    return c.json(result);

  } catch (error: any) {
    console.error('Add articles error:', error);
    return c.json({
      error: 'Internal server error',
      message: error.message
    }, 500);
  }
});

// ============================================
// 每日早报邮件推送
// ============================================
app.get('/digest', async (c) => {
  const apiKey = c.req.header('x-api-key');
  if (apiKey !== c.env.API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    await sendDigestEmail(c.env);
    return c.json({ success: true, message: 'Digest email sent' });
  } catch (error: any) {
    console.error('Digest error:', error);
    return c.json({ error: error.message || 'Internal error' }, 500);
  }
});

// ============================================
// Cron Trigger 处理
// ============================================
export default {
  ...app,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('[Digest] Scheduled task triggered at:', new Date().toISOString());
    await sendDigestEmail(env);
  }
};

// ============================================
// 语义去重核心逻辑
// ============================================

/**
 * 处理文章列表，带语义去重
 */
async function processArticlesWithDedup(env: Env, articles: Article[]): Promise<AddResult> {
  let inserted = 0;
  let skipped = 0;
  const duplicates: Array<{ title: string; similarity: number }> = [];

  // 批量处理（限制并发数以避免超时）
  const BATCH_SIZE = 10;
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(article => processSingleArticle(env, article))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { status, similarity, title } = result.value;

        if (status === 'inserted') {
          inserted++;
        } else if (status === 'duplicate') {
          skipped++;
          if (similarity) {
            duplicates.push({ title: title!, similarity });
          }
        } else if (status === 'skipped') {
          skipped++;
        }
      } else {
        console.error('[Dedup] Processing error:', result.reason);
        skipped++;
      }
    }
  }

  return {
    success: true,
    inserted,
    skipped,
    ...(duplicates.length > 0 && { duplicates })
  };
}

/**
 * 处理单篇文章：去重检查 + 写入
 */
async function processSingleArticle(
  env: Env,
  article: Article
): Promise<{ status: 'inserted' | 'duplicate' | 'skipped'; similarity?: number; title?: string }> {
  // 1. 先检查 external_id 是否已存在（快速去重）
  const existing = await env.DB.prepare(
    'SELECT id FROM articles WHERE external_id = ? LIMIT 1'
  ).bind(article.external_id).first();

  if (existing) {
    return { status: 'skipped', title: article.title };
  }

  // 2. 语义去重检查
  let dedupResult: DedupResult | null = null;

  try {
    dedupResult = await checkSimilarity(env, article);
  } catch (error) {
    // AI 服务失败时降级为普通写入
    console.warn('[Dedup] AI check failed, falling back to direct insert:', error);
  }

  // 3. 判定：是否重复
  if (dedupResult?.isDuplicate) {
    console.log(`[Dedup] Duplicate found: "${article.title}" (similarity: ${dedupResult.similarity})`);
    return {
      status: 'duplicate',
      similarity: dedupResult.similarity,
      title: article.title
    };
  }

  // 4. 写入 D1
  const createdAt = article.created_at ?? Math.floor(Date.now() / 1000);
  const stmt = env.DB.prepare(`
    INSERT INTO articles (title, url, source, summary, created_at, external_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = await stmt.bind(
    article.title,
    article.url,
    article.source,
    article.summary ?? '',
    createdAt,
    article.external_id
  ).run();

  if (!result.meta.last_row_id) {
    return { status: 'skipped', title: article.title };
  }

  const newId = result.meta.last_row_id;

  // 5. 异步写入向量索引（不阻塞响应）
  if (dedupResult?.vector) {
    // 使用 waitUntil 异步处理
    scheduleVectorInsert(env, newId, dedupResult.vector, createdAt);
  }

  return { status: 'inserted', title: article.title };
}

/**
 * 检查文章相似度
 */
async function checkSimilarity(
  env: Env,
  article: Article
): Promise<DedupResult & { vector?: number[] }> {
  // 构建用于 embedding 的文本
  const text = buildEmbeddingText(article);

  // 生成向量
  const vector = await generateEmbedding(env.AI, text);

  if (!vector) {
    throw new Error('Failed to generate embedding');
  }

  // 在 Vectorize 中搜索最相似的记录
  const matches = await env.VECTORS.query(vector, {
    topK: 1,
    returnValues: false,
    returnMetadata: true
  });

  if (matches.matches.length === 0) {
    return { isDuplicate: false, vector };
  }

  const topMatch = matches.matches[0];
  const similarity = topMatch.score ?? 0;

  // 相似度阈值判定
  if (similarity > SIMILARITY_THRESHOLD) {
    return {
      isDuplicate: true,
      similarity,
      existingId: parseInt(topMatch.id)
    };
  }

  return { isDuplicate: false, vector };
}

/**
 * 生成向量 Embedding
 */
async function generateEmbedding(ai: Ai, text: string): Promise<number[] | null> {
  try {
    const response = await ai.run(EMBEDDING_MODEL, text);
    // Cloudflare AI 返回的格式可能是 { data: [{ embedding: number[] }] }
    if (Array.isArray(response)) {
      return response as number[];
    }
    if (response && typeof response === 'object' && 'data' in response) {
      const data = response.data as Array<{ embedding?: number[] }>;
      if (data[0]?.embedding) {
        return data[0].embedding;
      }
    }
    return null;
  } catch (error) {
    console.error('[Embedding] Generation failed:', error);
    return null;
  }
}

/**
 * 构建用于 embedding 的文本
 * 优先使用摘要的第一点，其次标题
 */
function buildEmbeddingText(article: Article): string {
  // 尝试解析结构化摘要
  try {
    const structured = JSON.parse(article.summary) as StructuredSummary;
    if (structured.key_points?.[0]) {
      // 使用第一条关键点（最核心内容）
      return structured.key_points[0].slice(0, 500);
    }
  } catch (e) {
    // 不是 JSON，使用纯文本
  }

  // 降级：使用标题 + 摘要前 300 字
  const summaryText = (article.summary || '').slice(0, 300);
  return `${article.title}. ${summaryText}`.slice(0, 500);
}

/**
 * 异步插入向量到 Vectorize
 */
function scheduleVectorInsert(
  env: Env,
  id: number,
  vector: number[],
  createdAt: number
): void {
  // 使用 Promise 但不等待完成
  env.VECTORS.insert(String(id), vector, {
    created_at: createdAt.toString()
  }).catch(err => {
    console.error('[Vector] Insert failed:', err);
  });
}

// ============================================
// 邮件发送功能
// ============================================

interface ArticleWithEmail extends Article {
  parsed: StructuredSummary;
}

async function sendDigestEmail(env: Env): Promise<void> {
  const yesterday = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

  const { results } = await env.DB.prepare(`
    SELECT id, title, url, source, summary, created_at
    FROM articles
    WHERE created_at > ?
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(yesterday).all() as { results: Article[] };

  const highValueArticles: ArticleWithEmail[] = [];

  for (const article of results) {
    try {
      const parsed = JSON.parse(article.summary) as StructuredSummary;
      if (parsed.score && parsed.score > 6) {
        highValueArticles.push({ ...article, parsed });
      }
    } catch (e) {
      continue;
    }
  }

  highValueArticles.sort((a, b) => (b.parsed.score || 0) - (a.parsed.score || 0));
  const topArticles = highValueArticles.slice(0, 5);

  if (topArticles.length === 0) {
    console.log('[Digest] No high-value articles found, skipping email');
    return;
  }

  const html = generateEmailHtml(topArticles);
  const recipients = env.DIGEST_TO.split(',').map(e => e.trim());
  const from = env.DIGEST_FROM;

  for (const to of recipients) {
    await sendEmail(env.RESEND_API_KEY, {
      from,
      to,
      subject: `📰 Vibe 早报 | ${topArticles.length} 条高价值科技新闻`,
      html,
    });
    console.log(`[Digest] Email sent to: ${to}`);
  }
}

function generateEmailHtml(articles: ArticleWithEmail[]): string {
  const date = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  const articlesHtml = articles.map((article, index) => {
    const score = article.parsed.score || 0;
    const scoreClass = score >= 8 ? 'high' : score >= 6 ? 'medium' : 'low';
    const scoreEmoji = score >= 8 ? '🔥' : score >= 6 ? '⚡' : '📌';
    const firstPoint = article.parsed.key_points?.[0] || '点击查看详情';

    return `
      <div class="article">
        <div class="article-header">
          <span class="rank">#${index + 1}</span>
          <span class="score score-${scoreClass}">${scoreEmoji} ${score}</span>
          <span class="source">${article.source}</span>
        </div>
        <h3><a href="${article.url}">${escapeHtml(article.title)}</a></h3>
        <p class="summary">${escapeHtml(firstPoint)}</p>
      </div>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vibe 早报</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; border-bottom: 2px solid #0071e3; }
    .header h1 { color: #0071e3; margin: 0; font-size: 28px; }
    .header p { color: #666; margin: 10px 0 0; }
    .article { padding: 20px 0; border-bottom: 1px solid #eee; }
    .article:last-child { border-bottom: none; }
    .article-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .rank { background: #f5f5f7; padding: 4px 10px; border-radius: 8px; font-weight: bold; font-size: 14px; }
    .score { padding: 4px 10px; border-radius: 16px; font-size: 14px; font-weight: bold; }
    .score-high { background: linear-gradient(135deg, #ff6b6b, #ff8e53); color: white; }
    .score-medium { background: linear-gradient(135deg, #4ecdc4, #44a08d); color: white; }
    .source { background: #e8f5e9; color: #27ae60; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
    .article h3 { margin: 0 0 10px; font-size: 18px; }
    .article h3 a { color: #333; text-decoration: none; }
    .article h3 a:hover { color: #0071e3; }
    .summary { color: #666; margin: 0; font-size: 15px; }
    .footer { text-align: center; padding: 30px 0; color: #999; font-size: 14px; }
    .footer a { color: #0071e3; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚡ Vibe 早报</h1>
      <p>${date}</p>
    </div>
    ${articlesHtml}
    <div class="footer">
      <p>您收到此邮件是因为订阅了 Vibe Tech News 早报</p>
      <p><a href="https://my-tools-bim.pages.dev/tools/news">查看更多新闻 →</a></p>
    </div>
  </div>
</body>
</html>`;
}

interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(apiKey: string, params: SendEmailParams): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }

  const result = await response.json();
  console.log('[Digest] Email sent:', result);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
