/**
 * Optimized Keyword Extraction
 * Uses Set for O(1) lookups instead of O(n) array scanning
 */

import { CONFIG } from './constants';

// Convert to Set for O(1) lookups
const KEYWORD_SET = new Set([
  // ========== 时政/国际 ==========
  "特朗普", "拜登", "普京", "俄", "乌", "乌克兰", "俄罗斯", "美", "美国", "中", "中国",
  "日本", "日", "韩", "韩国", "欧盟", "北约", "联合国", "中东", "巴以", "以色列", "以",
  "加沙", "哈马斯", "东南亚", "东盟", "柬", "柬泰", "泰", "柬埔寨", "泰国", "越南",
  "菲律宾", "印尼", "马来西亚", "新加坡", "印度", "巴基斯坦", "伊朗", "土耳其", "沙特",
  "阿联酋", "卡塔尔", "英国", "法国", "德国", "意大利", "西班牙", "波兰", "瑞士", "瑞典", "挪威",

  // ========== 军事/安全 ==========
  "导弹", "袭击", "军事", "军队", "武器", "防空", "制裁", "战争", "冲突", "停火", "谈判",
  "核武", "军演", "舰队", "空军", "海军", "陆军", "国防", "安保", "情报", "间谍",

  // ========== 经济/商业 ==========
  "IPO", "上市", "融资", "投资", "收购", "并购", "财报", "营收", "利润", "亏损",
  "央行", "利率", "通胀", "GDP", "经济", "股市", "A股", "港股", "美股", "比特币",
  "以太坊", "数字货币", "银行", "保险", "证券", "科创板", "纳斯达克", "纽交所",
  "美联储", "欧央行", "降息", "加息", "汇率", "人民币", "美元", "欧元", "日元",
  "供应链", "产业链", "出口", "进口", "贸易", "顺差", "逆差", "关税", "贸易战",

  // ========== 科技/AI ==========
  "AI", "人工智能", "ChatGPT", "GPT", "OpenAI", "大模型", "LLM", "AGI",
  "谷歌", "微软", "苹果", "华为", "小米", "字节跳动", "阿里巴巴", "腾讯", "百度", "特斯拉",
  "英伟达", "AMD", "Intel", "三星", "索尼", "Meta", "亚马逊", "甲骨文", "IBM",
  "新能源汽车", "电动车", "芯片", "半导体", "集成电路", "存储", "内存",
  "区块链", "加密货币", "Web3", "NFT", "元宇宙", "虚拟现实", "VR", "AR", "MR",

  // ========== 能源/环境 ==========
  "石油", "天然气", "煤炭", "电力", "核能", "气候", "环保", "减排", "碳达峰", "碳中和",
  "电动汽车", "充电桩", "换电站", "动力电池", "风电", "光伏", "太阳能", "储能",

  // ========== 其他 ==========
  "5G", "6G", "Wi-Fi", "蓝牙", "卫星通信", "星链", "高铁", "地铁", "疫苗", "药物",
  "高考", "考研", "房地产", "楼市", "电影", "奥运会", "世界杯", "NBA",
] as const);

// Blacklist as Set for O(1) lookups
export const TAG_BLACKLIST = new Set([
  "新闻", "资讯", "消息", "报道", "文章", "内容", "信息", "动态",
  "最新", "今日", "热门", "爆款", "分享", "推荐", "精选", "必读",
  "关注", "聚焦", "深度", "解读", "分析", "观察", "评论", "观点",
  "图文", "视频", "音频", "直播", "短视频", "长文", "快讯", "简报",
  "今天", "昨天", "本周", "本月", "近期", "目前", "当前", "正在",
  "多个", "一些", "众多", "大量", "首批", "首个", "独家", "重磅", "突发",
  "国内", "国外", "海外", "全球", "全国", "各地", "地方",
] as const);

/**
 * Extract keywords from title using Set-based lookup
 * Time complexity: O(n) where n = title length (for includes check)
 * Space complexity: O(k) where k = MAX_KEYWORDS_PER_TITLE
 */
export function extractKeywords(title: string): string[] {
  const keywords: string[] = [];

  // Early exit for short titles
  if (title.length < 2) return keywords;

  for (const keyword of KEYWORD_SET) {
    if (keywords.length >= CONFIG.MAX_KEYWORDS_PER_TITLE) break;
    if (title.includes(keyword) && !TAG_BLACKLIST.has(keyword)) {
      keywords.push(keyword);
    }
  }

  return keywords;
}

/**
 * Filter tags through blacklist
 */
export function filterTags(tags: string[]): string[] {
  return tags.filter(tag =>
    tag.length <= CONFIG.MAX_TAG_LENGTH && !TAG_BLACKLIST.has(tag)
  );
}

/**
 * Calculate tag score based on quality metrics
 */
export function calculateTagScore(tags: string[], isAI: boolean): number {
  if (tags.length === 0) return 0;

  const baseScore = isAI ? 80 : 60;
  const qualityBonus = tags.reduce((sum, tag) => {
    const len = tag.length;
    // Prefer tags with length 2-6
    return sum + (len >= 2 && len <= 6 ? 10 : 5);
  }, 0);

  return Math.min(100, baseScore + qualityBonus / tags.length);
}
