/**
 * 语义匹配器 - 使用 Cloudflare Workers AI
 */

import type { NewsItem, NewsTheme, MatchedNewsItem } from './types';
import { THEME_NAMES } from './utils';

type AiBinding = {
  run: (model: string, input: unknown) => Promise<unknown>;
};

type MatchResult = {
  theme: NewsTheme;
  keywords: string[];
  relevanceScore: number;
};

/**
 * 使用 Cloudflare AI 进行语义匹配
 *
 * @param items 待匹配的新闻列表
 * @param keywordsByTheme 各主题的关键词
 * @param ai Cloudflare AI binding
 */
export async function matchNewsWithKeywords(opts: {
  items: NewsItem[];
  keywordsByTheme: Record<NewsTheme, string[]>;
  ai?: AiBinding;
}): Promise<MatchedNewsItem[]> {
  const { items, keywordsByTheme, ai } = opts;

  if (items.length === 0) return [];

  // 如果没有 AI binding，使用简单的关键词匹配
  if (!ai) {
    return simpleKeywordMatch(items, keywordsByTheme);
  }

  // 使用 Cloudflare AI 进行语义匹配
  return aiSemanticMatch(items, keywordsByTheme, ai);
}

/**
 * 简单关键词匹配（fallback）
 */
function simpleKeywordMatch(
  items: NewsItem[],
  keywordsByTheme: Record<NewsTheme, string[]>
): MatchedNewsItem[] {
  const results: MatchedNewsItem[] = [];

  for (const item of items) {
    const text = `${item.title} ${item.summary || ''}`.toLowerCase();

    for (const [theme, keywords] of Object.entries(keywordsByTheme) as [NewsTheme, string[]][]) {
      const matchedKeywords = keywords.filter((kw) =>
        text.includes(kw.toLowerCase())
      );

      if (matchedKeywords.length > 0) {
        results.push({
          ...item,
          theme,
          matchedKeywords,
          relevanceScore: Math.min(1, matchedKeywords.length * 0.3),
        });
        break; // 每条新闻只匹配一个主题
      }
    }
  }

  return results;
}

/**
 * Cloudflare AI 语义匹配
 */
async function aiSemanticMatch(
  items: NewsItem[],
  keywordsByTheme: Record<NewsTheme, string[]>,
  ai: AiBinding
): Promise<MatchedNewsItem[]> {
  // 构建 prompt
  const themes = Object.entries(keywordsByTheme)
    .map(([theme, keywords]) => `- ${theme} (${THEME_NAMES[theme]}): ${keywords.join(', ')}`)
    .join('\n');

  const newsList = items
    .slice(0, 50) // 限制数量避免 token 超限
    .map((item, i) => `[${i}] ${item.title}`)
    .join('\n');

  const prompt = `你是一个新闻分类助手。根据以下主题和关键词，判断每条新闻属于哪个主题。

主题和关键词：
${themes}

新闻列表：
${newsList}

请返回 JSON 数组，格式：[{"index": 0, "theme": "finance", "keywords": ["关键词1"], "score": 0.8}, ...]
只返回相关的新闻，不相关的跳过。score 表示相关度 0-1。
只返回 JSON，不要其他文字。`;

  try {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
    }) as { response?: string };

    const text = response?.response || '';

    // 提取 JSON
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('AI response has no JSON:', text);
      return simpleKeywordMatch(items, keywordsByTheme);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      theme: string;
      keywords: string[];
      score: number;
    }>;

    const results: MatchedNewsItem[] = [];
    for (const match of parsed) {
      const item = items[match.index];
      if (!item) continue;

      const theme = match.theme as NewsTheme;
      if (!['finance', 'economy', 'ai'].includes(theme)) continue;

      results.push({
        ...item,
        theme,
        matchedKeywords: match.keywords || [],
        relevanceScore: Math.max(0, Math.min(1, match.score || 0.5)),
      });
    }

    return results;
  } catch (e) {
    console.error('AI matching failed:', e);
    return simpleKeywordMatch(items, keywordsByTheme);
  }
}

/**
 * 按主题分组匹配结果
 */
export function groupByTheme(
  items: MatchedNewsItem[]
): Record<NewsTheme, MatchedNewsItem[]> {
  const result: Record<NewsTheme, MatchedNewsItem[]> = {
    finance: [],
    economy: [],
    ai: [],
  };

  for (const item of items) {
    if (result[item.theme]) {
      result[item.theme].push(item);
    }
  }

  // 按相关度排序
  for (const theme of Object.keys(result) as NewsTheme[]) {
    result[theme].sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  return result;
}
