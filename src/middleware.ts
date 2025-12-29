import type { MiddlewareHandler } from 'astro';
import { decodeSession } from '@/lib/session';
import { getEnv } from '@/lib/env';

// Type definitions for better type safety
interface SEOContext {
  request: Request;
  locals: App.Locals;
}

interface NextFn {
  (): Promise<Response>;
}

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/debug', // Debug endpoint for troubleshooting
  '/tools/news', // News page is public (SEO + social sharing)
];

// API 路径允许使用 X-Admin-Key 认证（用于 Cron/自动化）
const API_KEY_AUTH_PATHS = [
  '/api/news/run',
];

// SEO 配置
const SEO_API_BASE = 'https://news-api.zhusen-wang.workers.dev';
const SEO_AGENTS = [
  'twitterbot',
  'linkedinbot',
  'facebookexternalhit',
  'facebot',
  'telegrambot',
  'whatsapp',
  'slackbot',
  'discordbot',
  'googlebot',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'sogou',
  '爬虫',
  'spider'
];

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('/_astro')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (pathname.startsWith('/robots')) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function allowsApiKeyAuth(pathname: string): boolean {
  return API_KEY_AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * 检查是否为爬虫请求
 */
function isCrawler(userAgent: string): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return SEO_AGENTS.some(agent => ua.includes(agent));
}

/**
 * SEO 处理：为爬虫动态注入 OG Meta 标签
 */
async function handleSEO(context: SEOContext, next: NextFn) {
  const request = context.request;
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';

  // 只处理爬虫请求
  if (!isCrawler(userAgent)) {
    return next();
  }

  // 检查是否有文章 ID 参数
  const articleId = url.searchParams.get('id');
  if (!articleId) {
    return next();
  }

  // 获取响应并注入 Meta 标签
  const response = await next();

  // Early return for non-HTML responses (avoid unnecessary clone/parse)
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const html = await response.text();

  const ogImageUrl = `${SEO_API_BASE}/og?id=${articleId}`;
  const canonicalUrl = `${url.origin}${url.pathname}?id=${articleId}`;

  const metaTags = `
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/svg+xml" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${ogImageUrl}" />
    <link rel="canonical" href="${canonicalUrl}" />
  `;

  const modifiedHtml = html.replace('</head>', metaTags + '</head>');

  return new Response(modifiedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const request = context.request;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 优先处理 SEO（爬虫不需要认证）
  const userAgent = request.headers.get('user-agent') || '';
  if (isCrawler(userAgent) && url.searchParams.has('id')) {
    return handleSEO(context, next);
  }

  // 公开路径直接放行
  if (isPublicPath(pathname)) return next();

  // 确保 locals 存在
  if (!context.locals) {
    context.locals = {} as any;
  }

  // 如果是允许 API Key 认证的路径，且带有 X-Admin-Key header，则放行（由 API 自行验证）
  if (allowsApiKeyAuth(pathname) && request.headers.has('X-Admin-Key')) {
    return next();
  }

  const token = context.cookies.get('auth_session')?.value ?? null;
  const signed = context.cookies.get('auth_session_data')?.value ?? null;
  if (!token || !signed) {
    return context.redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  const env = getEnv(context.locals) as { SESSION_SECRET?: string };
  const secret = env.SESSION_SECRET;
  if (!secret) {
    // Session secret not configured - this is a configuration error
    throw new Error('SESSION_SECRET is not configured in Cloudflare environment variables.');
  }

  const payload = await decodeSession(signed, secret);
  if (!payload) return context.redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  if (payload.token !== token) return context.redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) {
    return context.redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  context.locals.user = { role: payload.role };
  return next();
};

