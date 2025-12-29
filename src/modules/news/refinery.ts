/**
 * News Refinery - 高信噪比 RSS 处理流水线
 *
 * 流程: Fetch -> Parse -> Clean -> Filter -> Cache -> Serve
 *
 * 核心原则:
 * 1. 数据完整性 - 严格的错误处理和验证
 * 2. 低延迟 - 并发抓取 + 智能缓存
 * 3. 高信噪比 - 多层过滤 + 信号评分
 */

import type {
  RawRssItem,
  RefinedArticle,
  SignalFilter,
  RefineryStats,
} from './types';

// ============================================================================
// 配置常量
// ============================================================================

const CONFIG = {
  // RSS 解析
  MAX_ITEM_COUNT: 200,
  MAX_CONTENT_LENGTH: 10000,

  // 过滤规则
  DEFAULT_FILTER: {
    minTitleLength: 5,
    maxTitleLength: 200,
    minContentLength: 20,
    blockedKeywords: [
      '广告', 'AD:', '赞助', 'sponsored', '推广',
      'test', '测试', 'placeholder',
    ],
    lowQualityPatterns: [
      /^(点击|click|read more)+$/i,
      /^.{0,3}$/,  // 太短
    ],
    duplicateThreshold: 0.85,  // 相似度阈值
  } as SignalFilter,

  // 信号评分
  SIGNAL_WEIGHTS: {
    titleLength: 0.1,
    contentLength: 0.2,
    sourceReliability: 0.3,
    freshness: 0.2,
    hasContent: 0.2,
  },

  // 缓存
  CACHE_TTL_MS: 5 * 60 * 1000,  // 5 分钟
  CACHE_KEY_PREFIX: 'news_feed:',
} as const;

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 生成文章 ID (URL hash)
 */
function generateId(url: string): string {
  // 使用 URL 的哈希值，Edge Runtime 兼容
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;  // Convert to 32bit integer
  }
  return `n_${Math.abs(hash).toString(36)}`;
}

/**
 * 检测语言
 */
export function detectLanguage(text: string): 'zh' | 'en' | 'other' {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;

  if (totalChars === 0) return 'other';

  const chineseRatio = chineseChars / totalChars;

  if (chineseRatio > 0.3) return 'zh';
  if (chineseRatio < 0.1) return 'en';
  return 'other';
}

/**
 * 计算字符串相似度 (Levenshtein distance 简化版)
 */
export function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = (a: string, b: string): number => {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  };

  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

/**
 * 提取纯文本（去除 HTML 标签）
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // 尝试在句子边界截断
  const sentenceEnd = text.slice(0, maxLength - 3).search(/[。！？.!?]\s*$/);
  if (sentenceEnd > maxLength * 0.5) {
    return text.slice(0, sentenceEnd + 1);
  }

  return text.slice(0, maxLength - 3) + '...';
}

// ============================================================================
// 信号处理核心
// ============================================================================

/**
 * 计算文章信号评分 (0-1)
 */
function calculateSignalScore(
  item: RawRssItem,
  ageHours: number
): number {
  let score = 0;

  // 1. 标题长度评分 (适中最佳)
  const titleLen = item.title.length;
  if (titleLen >= 15 && titleLen <= 80) {
    score += CONFIG.SIGNAL_WEIGHTS.titleLength;
  } else if (titleLen >= 10 && titleLen <= 100) {
    score += CONFIG.SIGNAL_WEIGHTS.titleLength * 0.5;
  }

  // 2. 内容长度评分
  const contentLen = (item.content || item.description || '').length;
  if (contentLen >= 100) {
    score += CONFIG.SIGNAL_WEIGHTS.contentLength;
  } else if (contentLen >= 50) {
    score += CONFIG.SIGNAL_WEIGHTS.contentLength * 0.5;
  }

  // 3. 有实际内容
  if (item.content || item.description) {
    score += CONFIG.SIGNAL_WEIGHTS.hasContent;
  }

  // 4. 新鲜度评分 (24 小时内线性衰减)
  const freshness = Math.max(0, 1 - ageHours / 24);
  score += CONFIG.SIGNAL_WEIGHTS.freshness * freshness;

  return Math.min(1, Math.max(0, score));
}

/**
 * 第一阶段: 清洗 (Cleaning)
 * - 去除 HTML 标签
 * - 标准化空白字符
 * - 处理特殊字符
 */
function cleanItem(item: RawRssItem): RawRssItem {
  return {
    ...item,
    title: stripHtml(item.title).trim(),
    description: item.description ? stripHtml(item.description).trim() : undefined,
    content: item.content ? stripHtml(item.content).trim() : undefined,
  };
}

/**
 * 第二阶段: 信号过滤 (Signal Filtering)
 * - 标题/内容长度检查
 * - 关键词过滤
 * - 低质量模式检测
 */
function filterSignal(item: RawRssItem, filter: SignalFilter): boolean {
  const { title, description, content } = item;

  // 长度检查
  if (title.length < filter.minTitleLength || title.length > filter.maxTitleLength) {
    return false;
  }

  const fullContent = content || description || '';
  if (fullContent.length < filter.minContentLength) {
    return false;
  }

  // 阻止关键词
  const lowerTitle = title.toLowerCase();
  const lowerContent = fullContent.toLowerCase();

  for (const keyword of filter.blockedKeywords) {
    const lowerKeyword = keyword.toLowerCase();
    if (lowerTitle.includes(lowerKeyword) || lowerContent.includes(lowerKeyword)) {
      return false;
    }
  }

  // 必需关键词 (如果有)
  if (filter.requiredKeywords && filter.requiredKeywords.length > 0) {
    const hasRequired = filter.requiredKeywords.some(kw => {
      const lowerKw = kw.toLowerCase();
      return lowerTitle.includes(lowerKw) || lowerContent.includes(lowerKw);
    });
    if (!hasRequired) {
      return false;
    }
  }

  // 低质量模式检测
  for (const pattern of filter.lowQualityPatterns) {
    if (pattern.test(title)) {
      return false;
    }
  }

  return true;
}

/**
 * 第三阶段: 去重 (Deduplication)
 * - 基于 URL 精确去重
 * - 基于标题相似度模糊去重
 */
function deduplicateItems(items: RawRssItem[]): RawRssItem[] {
  const seenUrls = new Set<string>();
  const unique: RawRssItem[] = [];

  for (const item of items) {
    // URL 精确去重
    if (seenUrls.has(item.link)) {
      continue;
    }
    seenUrls.add(item.link);

    // 标题相似度去重
    const isDuplicate = unique.some(existing =>
      similarity(item.title, existing.title) > CONFIG.DEFAULT_FILTER.duplicateThreshold
    );

    if (!isDuplicate) {
      unique.push(item);
    }
  }

  return unique;
}

/**
 * 第四阶段: 精炼 (Refining)
 * - 转换为标准格式
 * - 计算信号评分
 * - 语言检测
 */
function refineItem(item: RawRssItem): RefinedArticle {
  const now = Math.floor(Date.now() / 1000);
  const cleanItemData = cleanItem(item);

  // 解析发布时间
  let publishedAt = now;
  if (item.pubDate) {
    const parsed = new Date(item.pubDate);
    if (!isNaN(parsed.getTime())) {
      publishedAt = Math.floor(parsed.getTime() / 1000);
    }
  }

  // 计算年龄 (小时)
  const ageHours = (now - publishedAt) / 3600;

  // 提取摘要
  const rawSummary = cleanItemData.content || cleanItemData.description || '';
  const summary = truncateText(rawSummary, 300);

  // 信号评分
  const signalScore = calculateSignalScore(cleanItemData, ageHours);

  // 语言检测
  const language = detectLanguage(cleanItemData.title + ' ' + summary);

  return {
    id: generateId(item.link),
    url: item.link,
    title: cleanItemData.title,
    summary,
    source: item.source,
    author: item.author,
    published_at: publishedAt,
    refined_at: now,
    signal_score: Math.round(signalScore * 1000) / 1000,  // 保留 3 位小数
    language,
  };
}

// ============================================================================
// 主要导出函数
// ============================================================================

/**
 * Refinery 流水线入口
 *
 * @param rawItems - 原始 RSS 项数组
 * @param filter - 自定义过滤规则 (可选)
 * @returns 精炼后的文章和统计信息
 */
export function processRefinery(
  rawItems: RawRssItem[],
  filter?: Partial<SignalFilter>
): { articles: RefinedArticle[]; stats: RefineryStats } {
  const startTime = Date.now();
  const mergedFilter = { ...CONFIG.DEFAULT_FILTER, ...filter };

  // 统计
  const stats: RefineryStats = {
    total_raw: rawItems.length,
    after_dedup: 0,
    after_filter: 0,
    final_count: 0,
    sources: {} as Record<string, number>,
    processing_time_ms: 0,
  };

  // 阶段 1: 去重
  const deduped = deduplicateItems(rawItems);
  stats.after_dedup = deduped.length;

  // 阶段 2: 信号过滤
  const filtered = deduped.filter(item => filterSignal(item, mergedFilter));
  stats.after_filter = filtered.length;

  // 阶段 3: 精炼
  const refined = filtered.map(refineItem);

  // 按信号评分和时间排序
  refined.sort((a, b) => {
    // 首先按信号评分排序
    if (b.signal_score !== a.signal_score) {
      return b.signal_score - a.signal_score;
    }
    // 然后按发布时间排序
    return b.published_at - a.published_at;
  });

  stats.final_count = refined.length;
  stats.processing_time_ms = Date.now() - startTime;

  // 统计来源
  for (const item of rawItems) {
    stats.sources[item.source] = (stats.sources[item.source] || 0) + 1;
  }

  return { articles: refined, stats };
}

/**
 * 解析 RSS XML 为 RawRssItem[]
 */
export function parseRssXml(xml: string, sourceName: string): RawRssItem[] {
  const items: RawRssItem[] = [];

  // 匹配所有 <item> 块
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemBlock = match[1];

    // 提取字段
    const extractField = (tagName: string): string | undefined => {
      const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
      const m = itemBlock.match(regex);
      if (!m) return undefined;

      // 移除 CDATA 标记并解码实体
      let value = m[1]
        .replace(/^<!\[CDATA\[/, '')
        .replace(/\]\]>$/, '')
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
        source: sourceName,
      });
    }
  }

  return items;
}

/**
 * 创建缓存键
 */
export function createCacheKey(params: { source?: string; limit?: number }): string {
  const parts: string[] = [CONFIG.CACHE_KEY_PREFIX];
  if (params.source) parts.push(params.source);
  if (params.limit) parts.push(`limit:${params.limit}`);
  return parts.join(':');
}

/**
 * 验证 RSS 内容有效性
 */
export function isValidRssContent(text: string): boolean {
  // 检查是否包含 RSS/Atom 标记
  const hasRssTag = /<rss\b/i.test(text) || /<feed\b/i.test(text);

  // 检查是否包含 item 标签
  const hasItemTag = /<item\b/i.test(text) || /<entry\b/i.test(text);

  return hasRssTag && hasItemTag;
}

/**
 * 默认导出配置
 */
export const REFINERY_CONFIG = CONFIG;
