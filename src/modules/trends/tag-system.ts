/**
 * 标签过滤和同义词映射系统
 *
 * 功能：
 * 1. 过滤无意义标签（黑名单）
 * 2. 同义词归一化（如 AI = 人工智能）
 * 3. 标签质量评分
 */

/**
 * 无意义标签黑名单
 */
const TAG_BLACKLIST = new Set([
  // 通用词
  "新闻", "资讯", "消息", "报道", "文章", "内容", "信息", "动态", "最新", "今日", "热门", "爆款",
  "分享", "推荐", "精选", "必读", "关注", "聚焦", "深度", "解读", "分析", "观察", "评论",

  // 媒体类型
  "图文", "视频", "音频", "直播", "短视频", "长文", "快讯", "简报",

  // 时间相关
  "今天", "昨天", "本周", "本月", "近期", "目前", "当前",

  // 量词/形容词
  "多个", "一些", "众多", "大量", "首批", "首个", "独家", "重磅", "突发",

  // 操作词
  "点击", "查看", "阅读", "下载", "收藏", "转发", "点赞", "评论",

  // 地点（过于宽泛）
  "国内", "国外", "海外", "全球", "全国", "各地", "地方",

  // 其他
  "相关", "更多", "详情", "全文", "原文", "链接",
]);

/**
 * 同义词映射表
 * 格式: "归一化后的标签": ["同义词1", "同义词2", ...]
 */
const SYNONYM_GROUPS: Record<string, string[]> = {
  // AI/LLM
  "AI": ["人工智能", "AI技术", "大模型", "LLM", "AIGC", "机器学习", "深度学习",
        "ChatGPT", "GPT", "OpenAI", "Claude", "Gemini", "文心一言", "通义千问"],
  "LLM": ["大语言模型", "大模型", "语言模型"],

  // 公司
  "字节跳动": ["ByteDance", "抖音公司"],
  "阿里巴巴": ["阿里", "阿里巴巴集团", "Alibaba"],
  "腾讯": ["Tencent", "腾讯公司"],
  "百度": ["Baidu", "百度公司"],
  "华为": ["Huawei"],
  "小米": ["Xiaomi", "小米公司"],
  "苹果": ["Apple", "iPhone", "iPad", "Mac"],
  "特斯拉": ["Tesla", "马斯克"],
  "英伟达": ["NVIDIA", "Nvidia"],
  "微软": ["Microsoft", "MSFT"],
  "谷歌": ["Google", "Alphabet"],
  "亚马逊": ["Amazon"],
  "Meta": ["Facebook", "FB", "Instagram", "WhatsApp"],

  // 区块链
  "区块链": ["Blockchain", "链上", "Web3"],
  "加密货币": ["虚拟货币", "数字货币", "Crypto", "比特币", "BTC",
              "以太坊", "Ethereum", "ETH"],

  // 新能源
  "新能源汽车": ["电动车", "EV", "电动汽车"],
  "锂电池": ["电池", "动力电池"],

  // 芯片/半导体
  "芯片": ["半导体", "集成电路", "IC", "处理器", "CPU", "GPU"],

  // 游戏
  "游戏": ["电竞", "手游", "端游", "游戏产业"],

  // 医疗
  "医疗": ["医疗健康", "生物医药", "制药"],
  "疫苗": ["疫苗接种", "新冠疫苗"],

  // 教育
  "教育": ["在线教育", "教培", "培训"],

  // 金融
  "股市": ["股票", "A股", "港股", "美股"],
  "基金": ["投资基金", "理财"],
  "银行": ["银行业"],

  // 房地产
  "房地产": ["楼市", "房产"],

  // 零售
  "电商": ["电子商务", "网购", "在线购物"],
};

/**
 * 构建同义词查找表
 */
const SYNONYM_MAP = new Map<string, string>();

for (const [canonical, synonyms] of Object.entries(SYNONYM_GROUPS)) {
  for (const synonym of synonyms) {
    SYNONYM_MAP.set(synonym.toLowerCase(), canonical);
  }
  SYNONYM_MAP.set(canonical.toLowerCase(), canonical);
}

/**
 * 检查标签是否在黑名单中
 */
export function isBlacklistedTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  return TAG_BLACKLIST.has(normalized);
}

/**
 * 归一化标签（处理同义词）
 */
export function normalizeTag(tag: string): string {
  const normalized = tag.trim().toLowerCase();
  return SYNONYM_MAP.get(normalized) || tag.trim();
}

/**
 * 计算标签质量分数（0-100）
 * 分数越高，标签质量越好
 */
export function calculateTagScore(tag: string): number {
  let score = 50; // 基础分

  // 长度适中（2-6个字）加分
  const len = tag.length;
  if (len >= 2 && len <= 6) {
    score += 20;
  } else if (len > 6) {
    score -= 10;
  }

  // 包含中文字符加分（说明是有意义的中文词）
  if (/[\u4e00-\u9fa5]/.test(tag)) {
    score += 15;
  }

  // 纯英文大写缩写（如 AI、GDP）加分
  if (/^[A-Z]{2,4}$/.test(tag)) {
    score += 10;
  }

  // 包含数字扣分（可能是年份等）
  if (/\d/.test(tag)) {
    score -= 15;
  }

  // 包含特殊字符扣分
  if (/[^\u4e00-\u9fa5a-zA-Z]/.test(tag)) {
    score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * 过滤和归一化标签列表
 */
export function processTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawTag of tags) {
    const trimmed = rawTag.trim();

    // 跳过空标签和黑名单标签
    if (!trimmed || isBlacklistedTag(trimmed)) {
      continue;
    }

    // 归一化标签
    const normalized = normalizeTag(trimmed);

    // 去重
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  // Debug: log first few processTags calls
  if (tags.length > 0 && (tags[0] === '俄' || tags[0] === '特朗普' || tags[0] === 'IPO')) {
    console.log(`[processTags] Input: [${tags.join(', ')}] => Output: [${result.join(', ')}]`);
  }

  return result;
}

/**
 * 新闻项标签
 */
export interface NewsItemWithTags {
  id: string;
  title: string;
  url: string;
  tags: string[];
  tagScore: number; // 整体标签质量分数
}

/**
 * 批量处理新闻标签
 */
export async function processNewsItemsWithAI(
  items: Array<{ id: string; title: string; url: string }>,
  aiBinding?: any
): Promise<NewsItemWithTags[]> {
  console.log(`[tag-system] Processing ${items.length} news items, AI: ${!!aiBinding}`);
  const results: NewsItemWithTags[] = [];

  for (const item of items) {
    let tags: string[] = [];

    if (aiBinding) {
      // 使用 Cloudflare Workers AI 打标签
      try {
        tags = await generateTagsWithAI(item.title, aiBinding);
      } catch (error) {
        console.error("AI tagging failed:", error);
        // 如果 AI 失败，使用简单的关键词提取
        tags = extractKeywordsFromTitle(item.title);
      }
    } else {
      // 无 AI，使用关键词提取
      tags = extractKeywordsFromTitle(item.title);
    }

    // 处理标签（过滤、归一化）
    const processedTags = processTags(tags);

    // 限制最多5个标签
    const finalTags = processedTags.slice(0, 5);

    // 计算整体标签质量分数
    const tagScore = finalTags.length > 0
      ? finalTags.reduce((sum, tag) => sum + calculateTagScore(tag), 0) / finalTags.length
      : 0;

    results.push({
      id: item.id,
      title: item.title,
      url: item.url,
      tags: finalTags,
      tagScore,
    });
  }

  return results;
}

/**
 * 使用 Cloudflare Workers AI 生成标签
 */
async function generateTagsWithAI(title: string, aiBinding: any): Promise<string[]> {
  const prompt = `为以下新闻标题生成5个高质量标签。只返回标签，用逗号分隔，不要有其他内容。

标题：${title}

要求：
1. 标签要简洁（2-4个字）
2. 避免使用"新闻"、"资讯"等通用词
3. 优先选择能表达核心主题的词
4. 可以是公司名、产品名、行业名、技术名

标签：`;

  try {
    const response = await aiBinding.run("@cf/meta/llama-2-7b-chat-int8", {
      prompt,
      max_tokens: 100,
    });

    const text = response.trim();
    return text.split(/[,，、\n]/).map(t => t.trim()).filter(Boolean);
  } catch (error) {
    console.error("AI generation error:", error);
    return [];
  }
}

/**
 * 从标题中提取关键词（备用方案）
 * 使用中文关键词词典 + 简单模式匹配
 */
export function extractKeywordsFromTitle(title: string): string[] {
  const keywords: string[] = [];
  const originalTitle = title;

  // 扩展关键词词典 - 涵盖更多领域
  const keywordDict = [
    // 科技/AI
    "AI", "人工智能", "ChatGPT", "GPT", "OpenAI", "大模型", "LLM",
    "谷歌", "微软", "苹果", "华为", "小米", "字节跳动", "阿里巴巴", "腾讯", "百度", "特斯拉",
    "英伟达", "AMD", "Intel", "三星", "索尼", "Meta", "亚马逊",
    "新能源汽车", "电动车", "芯片", "半导体", "区块链", "加密货币",
    "元宇宙", "VR", "AR", "游戏", "电竞", "直播", "短视频",
    "电商", "零售", "医疗", "教育", "金融", "股市", "基金",
    "碳中和", "新能源", "光伏", "风电", "储能",

    // 时政/国际（包含简称）
    "特朗普", "特朗普", "拜登", "普京", "俄", "乌", "乌克兰", "俄罗斯", "美", "美国", "中", "中国", "日本", "日", "韩", "韩国",
    "欧盟", "北约", "联合国", "中东", "巴以", "以色列", "以", "加沙",
    "东南亚", "东盟", "柬", "柬泰", "泰", "柬埔寨", "泰国", "越南", "菲律宾",

    // 军事/安全
    "导弹", "袭击", "军事", "军队", "武器", "防空", "制裁", "战争",

    // 经济/商业
    "IPO", "上市", "融资", "投资", "收购", "并购", "财报", "营收",
    "央行", "利率", "通胀", "GDP", "经济", "股市", "A股", "港股", "美股",
    "比特币", "以太坊", "数字货币", "银行", "保险", "证券", "科创板",

    // 社会/民生
    "房地产", "楼市", "房价", "就业", "失业", "工资", "社保", "养老",
    "医疗", "疫苗", "疫情", "教育", "高考", "大学", "双减", "渔业法",

    // 法律/政策
    "法律", "法规", "政策", "监管", "罚款", "违法", "犯罪",

    // 科技/互联网
    "5G", "6G", "Wi-Fi", "蓝牙", "算法", "数据", "云计算", "网络安全",
    "APP", "应用", "软件", "硬件", "智能", "自动驾驶", "机器人", "HBM",

    // 能源/环境
    "石油", "天然气", "煤炭", "电力", "核能", "气候", "环保", "减排",

    // 交通
    "高铁", "地铁", "航空", "机场", "汽车", "车企",

    // 文体娱乐
    "电影", "电视剧", "综艺", "明星", "艺人", "网红", "主播",

    // 企业/公司（新增）
    "网易", "格力博", "迈为股份", "中银", "同心医疗",
  ];

  // 先精确匹配
  for (const keyword of keywordDict) {
    if (title.includes(keyword) && !keywords.includes(keyword)) {
      keywords.push(keyword);
      if (keywords.length >= 5) break;
    }
  }

  // 如果关键词不足，尝试提取可能的有意义词组
  if (keywords.length < 3) {
    // 提取引号内的内容（通常是专有名词）
    const quotedMatches = title.match(/["「『](.*?)["」』]/g);
    if (quotedMatches) {
      for (const match of quotedMatches) {
        const word = match.replace(/["「『」』]/g, "");
        if (word.length >= 2 && word.length <= 6 && !keywords.includes(word)) {
          keywords.push(word);
          if (keywords.length >= 5) break;
        }
      }
    }
  }

  // Debug log for first few items
  if (originalTitle.includes('俄军') || originalTitle.includes('特朗普') || originalTitle.includes('IPO')) {
    console.log(`[extractKeywords] "${originalTitle.substring(0, 30)}" => [${keywords.join(', ')}]`);
  }

  return keywords;
}

/**
 * 标签统计结果
 */
export interface TagStats {
  tag: string;
  count: number;
  trend: "up" | "down" | "stable"; // 与前一日相比
  changePercent: number; // 变化百分比
}

/**
 * 统计标签频率并排序
 */
export function calculateTagStats(
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

    stats.push({
      tag,
      count,
      trend,
      changePercent,
    });
  }

  // 按出现次数降序排序
  stats.sort((a, b) => b.count - a.count);

  return stats.slice(0, 50); // 返回前50个标签
}
