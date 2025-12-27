/**
 * 信息流 Agent - 主流程编排
 */

import type { NewsReport, NewsTheme, MatchedNewsItem, NewsSourceId } from './types';
import { aggregateAllSources } from './aggregator';
import { matchNewsWithKeywords, groupByTheme } from './matcher';
import { getKeywords } from './store';
import { nowIso, dayKeyShanghai, THEME_NAMES } from './utils';

type AiBinding = {
  run: (model: string, input: unknown) => Promise<unknown>;
};

export type NewsAgentOpts = {
  kv: KVNamespace;
  ai?: AiBinding;
  // 如果不从 KV 读取，可以直接传入关键词
  keywordsOverride?: Record<NewsTheme, string[]>;
};

/**
 * 运行信息流 Agent
 *
 * 1. 从 KV 获取 Trend Radar 生成的关键词
 * 2. 并行抓取所有数据源
 * 3. 使用 AI 语义匹配新闻与关键词
 * 4. 按主题分组返回
 */
export async function runNewsAgent(opts: NewsAgentOpts): Promise<NewsReport> {
  const startTime = Date.now();
  const dayKey = dayKeyShanghai();

  // 1. 获取关键词
  let keywordsByTheme: Record<NewsTheme, string[]>;

  if (opts.keywordsOverride) {
    keywordsByTheme = opts.keywordsOverride;
  } else {
    const stored = await getKeywords(opts.kv);
    if (stored?.keywords) {
      keywordsByTheme = stored.keywords;
    } else {
      // 默认关键词（如果 Trend Radar 还没运行）
      keywordsByTheme = {
        finance: ['股市', '美股', 'A股', '降息', '美联储', 'Fed', '利率', '债券'],
        economy: ['GDP', 'CPI', '通胀', '就业', '经济', '贸易', '关税'],
        ai: ['AI', '人工智能', 'ChatGPT', 'OpenAI', 'Claude', 'Gemini', '大模型', 'LLM', '机器人'],
      };
    }
  }

  // 2. 聚合所有数据源
  const aggregated = await aggregateAllSources({
    limitPerSource: 25,
    timeoutMs: 12000,
  });

  // 3. 语义匹配
  const matched = await matchNewsWithKeywords({
    items: aggregated.items,
    keywordsByTheme,
    ai: opts.ai,
  });

  // 4. 按主题分组
  const grouped = groupByTheme(matched);

  // 5. 构建报告
  const byTheme = (Object.entries(grouped) as [NewsTheme, MatchedNewsItem[]][])
    .filter(([, items]) => items.length > 0)
    .map(([theme, items]) => ({
      theme,
      themeName: THEME_NAMES[theme] || theme,
      keywords: keywordsByTheme[theme] || [],
      items: items.slice(0, 20), // 每个主题最多 20 条
    }));

  // 构建 sources_status
  const sourcesStatus = {} as NewsReport['meta']['sources_status'];
  for (const [sourceId, result] of Object.entries(aggregated.bySource)) {
    sourcesStatus[sourceId as NewsSourceId] = {
      ok: !result.error && result.items.length > 0,
      items: result.items.length,
      error: result.error,
    };
  }

  return {
    meta: {
      generated_at: nowIso(),
      day_key: dayKey,
      keywords_used: keywordsByTheme,
      sources_status: sourcesStatus,
      total_fetched: aggregated.totalFetched,
      total_matched: matched.length,
      execution_time_ms: Date.now() - startTime,
    },
    by_theme: byTheme,
  };
}
