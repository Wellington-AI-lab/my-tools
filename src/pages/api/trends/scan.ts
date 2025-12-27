/**
 * 趋势雷达扫描 API
 * 从 newsnow 获取新闻数据，使用 AI 打标签，统计标签趋势
 */

import { processNewsItemsWithAI, calculateTagStats, type NewsItemWithTags, type TagStats } from '@/modules/trends/tag-system';
import { requireKV } from '@/lib/env';

const NEWSNOW_API_URL = "https://newsbim.pages.dev/api/trends/aggregate";
const CACHE_KEY_PREFIX = "trends:";
const CACHE_TTL = 60 * 60; // 1小时缓存
const HISTORY_KEY = "trends:history";

interface NewsnowResponse {
  success: boolean;
  count: number;
  timestamp: number;
  items: Array<{
    id: string;
    title: string;
    url: string;
    extra?: {
      source?: string;
      date?: number | string;
    };
  }>;
  sources: string[];
}

interface TrendReport {
  generatedAt: string;
  newsCount: number;
  sources: string[];
  topTags: TagStats[];
  recentNews: NewsItemWithTags[];
}

export async function GET({ locals }: { locals: App.Locals }) {
  const kv = requireKV(locals);

  try {
    // 检查缓存
    const cacheKey = `${CACHE_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      return Response.json(JSON.parse(cached));
    }

    // 从 newsnow 获取数据
    const newsnowResponse = await fetch(NEWSNOW_API_URL, {
      headers: {
        "User-Agent": "my-tools-trends-radar",
      },
    });

    if (!newsnowResponse.ok) {
      throw new Error(`newsnow API failed: ${newsnowResponse.status}`);
    }

    const data: NewsnowResponse = await newsnowResponse.json();

    if (!data.success || !data.items) {
      throw new Error("Invalid newsnow response");
    }

    // 获取 AI binding（如果可用）
    const aiBinding = (locals as any).runtime?.env?.AI;

    // 处理新闻：AI 打标签
    const newsWithTags = await processNewsItemsWithAI(
      data.items.map(item => ({
        id: item.id,
        title: item.title,
        url: item.url,
      })),
      aiBinding
    );

    // 获取前一天的历史数据进行对比
    const yesterdayKey = `${CACHE_KEY_PREFIX}${getYesterdayDateString()}`;
    const yesterdayDataRaw = await kv.get(yesterdayKey);
    let previousStats: Map<string, number> | undefined;

    if (yesterdayDataRaw) {
      const yesterdayData: TrendReport = JSON.parse(yesterdayDataRaw);
      previousStats = new Map(
        yesterdayData.topTags.map(t => [t.tag, t.count])
      );
    }

    // 计算标签统计
    const topTags = calculateTagStats(newsWithTags, previousStats);

    // 构建报告
    const report: TrendReport = {
      generatedAt: new Date().toISOString(),
      newsCount: data.count,
      sources: data.sources,
      topTags,
      recentNews: newsWithTags.slice(0, 20), // 只返回前20条新闻
    };

    // 缓存结果
    await kv.put(cacheKey, JSON.stringify(report), { expirationTtl: CACHE_TTL });

    return Response.json(report);
  } catch (error: any) {
    console.error("Trends scan error:", error);
    return Response.json({
      error: error.message || "Failed to scan trends",
      generatedAt: new Date().toISOString(),
      newsCount: 0,
      sources: [],
      topTags: [],
      recentNews: [],
    }, { status: 500 });
  }
}

function getYesterdayDateString(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}
