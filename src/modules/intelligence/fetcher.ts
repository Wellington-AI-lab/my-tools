/**
 * Intelligence Fetcher - 核心抓取逻辑
 *
 * 支持 DIRECT 和 RSSHUB 两种策略，实现重试和可靠性评分机制
 */

import type {
  IntelligenceSource,
  SourceFetchResult,
  SourceStrategy,
  IntelligenceArticle,
} from './types';

// RSS 解析结果
interface RssItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  author?: string;
  content?: string;
}

// 配置常量
const CONFIG = {
  MAX_RETRY_ATTEMPTS: 2,
  BASE_TIMEOUT_MS: 10000,
  RELIABILITY_DECREMENT: 0.1,
  RELIABILITY_INCREMENT: 0.02,
  MIN_RELIABILITY_SCORE: 0.0,
  MAX_RELIABILITY_SCORE: 1.0,
  USER_AGENT: 'Mozilla/5.0 (compatible; IntelligenceBot/1.0; +https://my-tools.bim.pages.dev)',
} as const;

/**
 * 构建抓取 URL
 */
function buildFetchUrl(source: IntelligenceSource, rsshubBaseUrl?: string): string {
  const strategy = source.strategy as SourceStrategy;

  if (strategy === 'RSSHUB') {
    if (!source.rsshub_path) {
      throw new Error(`RSSHUB strategy requires rsshub_path for source ${source.name}`);
    }
    const baseUrl = rsshubBaseUrl?.trim() || 'https://rsshub.app';
    // 确保路径格式正确
    const path = source.rsshub_path.startsWith('/')
      ? source.rsshub_path
      : `/${source.rsshub_path}`;
    return `${baseUrl}${path}`;
  }

  // DIRECT 策略
  return source.url;
}

/**
 * 简单的 RSS XML 解析器
 * 提取 <item> 元素中的标题、链接、描述、发布日期等
 */
function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // 匹配所有 <item> 块
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemBlock = match[1];

    // 提取各字段
    const extractField = (tagName: string): string | undefined => {
      const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
      const m = itemBlock.match(regex);
      if (!m) return undefined;
      // 移除 CDATA 标记
      let value = m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
      // 解码基本 XML 实体
      value = value
        .split('&amp;').join('&')
        .split('&lt;').join('<')
        .split('&gt;').join('>')
        .split('&quot;').join('"')
        .split('&apos;').join("'");
      return value.trim();
    };

    const title = extractField('title');
    const link = extractField('link');
    const description = extractField('description');
    const pubDate = extractField('pubDate');
    const author = extractField('author');
    const content = extractField('content:encoded') || extractField('content');

    if (title && link) {
      items.push({
        title,
        link,
        description,
        pubDate,
        author,
        content,
      });
    }
  }

  return items;
}

/**
 * 将 RSS Item 转换为 IntelligenceArticle
 */
function rssItemToArticle(item: RssItem, sourceId: number): IntelligenceArticle {
  // 生成唯一 ID（使用 URL 的 hash）
  const id = Buffer.from(item.link).toString('base64').slice(0, 16);

  // 解析发布时间
  let publishedAt = Date.now();
  if (item.pubDate) {
    const parsed = new Date(item.pubDate);
    if (!isNaN(parsed.getTime())) {
      publishedAt = parsed.getTime();
    }
  }

  return {
    id,
    source_id: sourceId,
    url: item.link,
    title: item.title,
    summary: item.description,
    content: item.content || item.description,
    author: item.author,
    published_at: Math.floor(publishedAt / 1000),
    scraped_at: Math.floor(Date.now() / 1000),
    tags: [],
  };
}

/**
 * 单次抓取尝试
 */
async function fetchOnce(
  url: string,
  timeoutMs: number
): Promise<{ success: boolean; xml?: string; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Encoding': 'gzip, deflate',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    // 检查内容长度
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
      return { success: false, error: 'Response too large (max 5MB)' };
    }

    const text = await response.text();

    // 基本验证 - 检查是否包含 RSS 标记
    if (!text.includes('<rss') && !text.includes('<feed')) {
      return { success: false, error: 'Invalid RSS/Atom feed' };
    }

    return { success: true, xml: text };

  } catch (error) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * 抓取单个数据源（带重试）
 */
export async function fetchIntelligence(
  source: IntelligenceSource,
  opts: {
    rsshubBaseUrl?: string;
    timeoutMs?: number;
    maxRetries?: number;
  } = {}
): Promise<SourceFetchResult & { articles?: IntelligenceArticle[] }> {
  const {
    rsshubBaseUrl,
    timeoutMs = CONFIG.BASE_TIMEOUT_MS,
    maxRetries = CONFIG.MAX_RETRY_ATTEMPTS,
  } = opts;

  const startTime = Date.now();
  const url = buildFetchUrl(source, rsshubBaseUrl);

  console.log(`[intelligence/fetcher] Fetching ${source.name} (${source.strategy}): ${url}`);

  // 重试逻辑
  let lastError: string | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // 指数退避
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`[intelligence/fetcher] Retry ${attempt}/${maxRetries} for ${source.name} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const result = await fetchOnce(url, timeoutMs);

    if (result.success && result.xml) {
      const items = parseRssXml(result.xml);
      const articles = items.map(item => rssItemToArticle(item, source.id));

      console.log(`[intelligence/fetcher] Success: ${source.name} - ${articles.length} articles`);

      return {
        source_id: source.id,
        success: true,
        items_count: articles.length,
        fetch_time_ms: Date.now() - startTime,
        articles,
      };
    }

    lastError = result.error;
  }

  // 所有尝试都失败
  console.warn(`[intelligence/fetcher] Failed: ${source.name} - ${lastError}`);

  return {
    source_id: source.id,
    success: false,
    items_count: 0,
    error: lastError,
    fetch_time_ms: Date.now() - startTime,
  };
}

/**
 * 批量抓取多个数据源
 * 按可靠性排序并发抓取
 */
export async function fetchMultipleSources(
  sources: IntelligenceSource[],
  opts: {
    rsshubBaseUrl?: string;
    timeoutMs?: number;
    maxRetries?: number;
    concurrency?: number;
  } = {}
): Promise<SourceFetchResult[]> {
  const {
    rsshubBaseUrl,
    timeoutMs,
    maxRetries,
    concurrency = 5, // 默认并发数
  } = opts;

  // 按可靠性评分和权重排序
  const sorted = [...sources].sort((a, b) => {
    // 优先抓取活跃且可靠性高的源
    const aActive = a.is_active ? 1 : 0;
    const bActive = b.is_active ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;

    const aScore = a.reliability_score * a.weight;
    const bScore = b.reliability_score * b.weight;
    return bScore - aScore;
  });

  const results: SourceFetchResult[] = [];

  // 分批并发抓取
  for (let i = 0; i < sorted.length; i += concurrency) {
    const batch = sorted.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(source =>
        fetchIntelligence(source, { rsshubBaseUrl, timeoutMs, maxRetries })
      )
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * 计算新的可靠性评分
 */
export function calculateNewReliability(
  currentScore: number,
  success: boolean
): number {
  const change = success
    ? CONFIG.RELIABILITY_INCREMENT
    : CONFIG.RELIABILITY_DECREMENT;

  const newScore = Math.min(
    CONFIG.MAX_RELIABILITY_SCORE,
    Math.max(CONFIG.MIN_RELIABILITY_SCORE, currentScore + (success ? change : -change))
  );

  return Number(newScore.toFixed(3));
}

/**
 * 更新数据源的可靠性评分和最后抓取时间
 */
export interface UpdateSourceResult {
  success: boolean;
  sourceId: number;
  reliabilityChanged: boolean;
  oldScore?: number;
  newScore?: number;
}

/**
 * 批量更新源状态到 D1
 */
export async function updateSourceStatuses(
  db: D1Database,
  fetchResults: Array<SourceFetchResult & { success?: boolean }>
): Promise<UpdateSourceResult[]> {
  const results: UpdateSourceResult[] = [];
  const now = new Date().toISOString();

  for (const result of fetchResults) {
    const sourceId = result.source_id;
    const success = result.success ?? false;

    try {
      // 获取当前评分
      const currentResult = await db
        .prepare('SELECT reliability_score FROM intelligence_sources WHERE id = ?')
        .bind(sourceId)
        .first<{ reliability_score: number }>();

      if (!currentResult) {
        results.push({ success: false, sourceId, reliabilityChanged: false });
        continue;
      }

      const oldScore = currentResult.reliability_score;
      const newScore = calculateNewReliability(oldScore, success);
      const reliabilityChanged = Math.abs(newScore - oldScore) > 0.001;

      // 更新数据库
      await db
        .prepare(`
          UPDATE intelligence_sources
          SET last_scraped_at = ?,
              reliability_score = ?,
              updated_at = ?
          WHERE id = ?
        `)
        .bind(now, newScore, now, sourceId)
        .run();

      results.push({
        success: true,
        sourceId,
        reliabilityChanged,
        oldScore,
        newScore,
      });

      if (reliabilityChanged) {
        console.log(`[intelligence/fetcher] Source ${sourceId}: reliability ${oldScore.toFixed(3)} -> ${newScore.toFixed(3)}`);
      }

    } catch (error) {
      console.error(`[intelligence/fetcher] Failed to update source ${sourceId}:`, error);
      results.push({ success: false, sourceId, reliabilityChanged: false });
    }
  }

  return results;
}
