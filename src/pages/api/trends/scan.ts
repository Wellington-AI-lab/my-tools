/**
 * 趋势雷达扫描 API
 * 从 newsnow 获取新闻数据，使用 AI 打标签，统计标签趋势
 */

import { requireKV } from '@/lib/env';

const NEWSNOW_API_URL = "https://newsbim.pages.dev/api/trends/aggregate";
const CACHE_KEY_PREFIX = "trends:";
const CACHE_TTL = 60 * 60; // 1小时缓存

// 内联关键词词典，避免导入问题
const KEYWORD_DICT = [
  // 时政/国际
  "特朗普", "拜登", "普京", "俄", "乌", "乌克兰", "俄罗斯", "美", "美国", "中", "中国", "日本", "日", "韩", "韩国",
  "欧盟", "北约", "联合国", "中东", "巴以", "以色列", "以", "加沙",
  "东南亚", "东盟", "柬", "柬泰", "泰", "柬埔寨", "泰国", "越南", "菲律宾",
  // 军事/安全
  "导弹", "袭击", "军事", "军队", "武器", "防空", "制裁", "战争",
  // 经济/商业
  "IPO", "上市", "融资", "投资", "收购", "并购", "财报", "营收",
  "央行", "利率", "通胀", "GDP", "经济", "股市", "A股", "港股", "美股",
  "比特币", "以太坊", "数字货币", "银行", "保险", "证券", "科创板",
  // 科技/AI
  "AI", "人工智能", "ChatGPT", "GPT", "OpenAI", "大模型", "LLM",
  "谷歌", "微软", "苹果", "华为", "小米", "字节跳动", "阿里巴巴", "腾讯", "百度", "特斯拉",
  "英伟达", "AMD", "Intel", "三星", "索尼", "Meta", "亚马逊",
  "新能源汽车", "电动车", "芯片", "半导体", "区块链", "加密货币",
  "元宇宙", "VR", "AR", "游戏", "电竞", "直播", "短视频",
  "电商", "零售", "医疗", "教育", "金融", "股市", "基金",
  "碳中和", "新能源", "光伏", "风电", "储能",
  // 科技/互联网
  "5G", "6G", "Wi-Fi", "蓝牙", "算法", "数据", "云计算", "网络安全",
  "APP", "应用", "软件", "硬件", "智能", "自动驾驶", "机器人", "HBM",
  // 能源/环境
  "石油", "天然气", "煤炭", "电力", "核能", "气候", "环保", "减排",
  // 交通
  "高铁", "地铁", "航空", "机场", "汽车", "车企",
  // 企业/公司
  "网易", "格力博", "迈为股份", "中银", "同心医疗",
];

// 黑名单
const TAG_BLACKLIST = new Set([
  "新闻", "资讯", "消息", "报道", "文章", "内容", "信息", "动态",
  "最新", "今日", "热门", "爆款", "分享", "推荐", "精选", "必读",
  "关注", "聚焦", "深度", "解读", "分析", "观察", "评论",
]);

function extractKeywords(title: string): string[] {
  const keywords: string[] = [];
  for (const keyword of KEYWORD_DICT) {
    if (title.includes(keyword) && !keywords.includes(keyword)) {
      keywords.push(keyword);
      if (keywords.length >= 5) break;
    }
  }
  return keywords;
}

interface NewsItemWithTags {
  id: string;
  title: string;
  url: string;
  tags: string[];
  tagScore: number;
}

interface TagStats {
  tag: string;
  count: number;
  trend: "up" | "down" | "stable";
  changePercent: number;
}

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

export async function GET({ locals, url }: { locals: App.Locals; url: URL }) {
  const kv = requireKV(locals);
  const forceRefresh = url.searchParams.get('force') === 'true';

  try {
    // 检查缓存
    const cacheKey = `${CACHE_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;
    const cached = await kv.get(cacheKey);
    if (cached && !forceRefresh) {
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

    console.log(`[trends/scan] Processing ${data.items.length} news items`);

    // 处理新闻：提取关键词
    const newsWithTags: NewsItemWithTags[] = data.items.map(item => {
      const rawTags = extractKeywords(item.title);
      // 过滤黑名单
      const tags = rawTags.filter(tag => !TAG_BLACKLIST.has(tag));
      const tagScore = tags.length > 0
        ? tags.reduce((sum, tag) => sum + (tag.length >= 2 && tag.length <= 6 ? 70 : 50), 0) / tags.length
        : 0;

      return {
        id: item.id,
        title: item.title,
        url: item.url,
        tags,
        tagScore,
      };
    });

    console.log(`[trends/scan] Processed ${newsWithTags.length} items, first 5:`,
      newsWithTags.slice(0, 5).map(i => ({ t: i.title.substring(0, 15), tags: i.tags })));

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

function calculateTagStats(
  newsWithTags: NewsItemWithTags[],
  previousStats?: Map<string, number>
): TagStats[] {
  const tagCounts = new Map<string, number>();

  // 统计每个标签的出现次数
  for (const item of newsWithTags) {
    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  // 转换为数组并计算趋势
  const stats: TagStats[] = [];
  for (const [tag, count] of tagCounts.entries()) {
    const prevCount = previousStats?.get(tag) || 0;
    let trend: "up" | "down" | "stable" = "stable";
    let changePercent = 0;

    if (count > prevCount) {
      trend = "up";
      changePercent = prevCount > 0 ? ((count - prevCount) / prevCount) * 100 : 100;
    } else if (count < prevCount) {
      trend = "down";
      changePercent = prevCount > 0 ? ((prevCount - count) / prevCount) * 100 : 100;
    }

    stats.push({ tag, count, trend, changePercent });
  }

  // 按出现次数降序排序
  stats.sort((a, b) => b.count - a.count);

  return stats.slice(0, 50); // 返回前50个标签
}

function getYesterdayDateString(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}
