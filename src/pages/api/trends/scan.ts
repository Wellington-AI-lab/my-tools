/**
 * 趋势雷达扫描 API
 * 从 newsnow 获取新闻数据，使用 AI 打标签，统计标签趋势
 */

import { requireKV, requireD1, getEnv } from '@/lib/env';

const NEWSNOW_API_URL = "https://newsbim.pages.dev/api/trends/aggregate";
const CACHE_KEY_PREFIX = "trends:";
const CACHE_TTL = 60 * 60; // 1小时缓存

// 内联关键词词典，避免导入问题
const KEYWORD_DICT = [
  // ========== 时政/国际 ==========
  "特朗普", "拜登", "普京", "俄", "乌", "乌克兰", "俄罗斯", "美", "美国", "中", "中国", "日本", "日", "韩", "韩国",
  "欧盟", "北约", "联合国", "中东", "巴以", "以色列", "以", "加沙", "哈马斯",
  "东南亚", "东盟", "柬", "柬泰", "泰", "柬埔寨", "泰国", "越南", "菲律宾", "印尼", "马来西亚", "新加坡",
  "印度", "巴基斯坦", "伊朗", "土耳其", "沙特", "阿联酋", "卡塔尔",
  "英国", "法国", "德国", "意大利", "西班牙", "波兰", "瑞士", "瑞典", "挪威",

  // ========== 军事/安全 ==========
  "导弹", "袭击", "军事", "军队", "武器", "防空", "制裁", "战争", "冲突", "停火", "谈判",
  "核武", "军演", "舰队", "空军", "海军", "陆军", "国防", "安保", "情报", "间谍",

  // ========== 经济/商业 ==========
  "IPO", "上市", "融资", "投资", "收购", "并购", "财报", "营收", "利润", "亏损",
  "央行", "利率", "通胀", "GDP", "经济", "股市", "A股", "港股", "美股", "股市",
  "比特币", "以太坊", "数字货币", "银行", "保险", "证券", "科创板", "纳斯达克", "纽交所",
  "美联储", "欧央行", "央行", "降息", "加息", "汇率", "人民币", "美元", "欧元", "日元",
  "供应链", "产业链", "出口", "进口", "贸易", "顺差", "逆差", "关税", "贸易战",
  "独角兽", "市值", "估值", "融资轮", "天使轮", "A轮", "B轮", "C轮", "Pre-IPO",
  "风投", "创投", "私募", "基金", "公募", "私募", "理财", "资管",

  // ========== 科技/AI ==========
  "AI", "人工智能", "ChatGPT", "GPT", "OpenAI", "大模型", "LLM", "AGI",
  "谷歌", "微软", "苹果", "华为", "小米", "字节跳动", "阿里巴巴", "腾讯", "百度", "特斯拉",
  "英伟达", "AMD", "Intel", "三星", "索尼", "Meta", "亚马逊", "甲骨文", "IBM",
  "新能源汽车", "电动车", "芯片", "半导体", "集成电路", "存储", "内存",
  "区块链", "加密货币", "Web3", "NFT", "元宇宙", "虚拟现实", "VR", "AR", "MR",
  "游戏", "电竞", "直播", "短视频", "长视频", "视频平台", "社交平台", "即时通讯",
  "电商", "零售", "O2O", "新零售", "直播带货", "跨境电商", "社区团购",
  "医疗", "教育", "金融", "支付", "数字支付", "移动支付", "征信",
  "碳中和", "新能源", "光伏", "风电", "储能", "锂电池", "氢能", "核电",
  "5G", "6G", "Wi-Fi", "蓝牙", "卫星通信", "星链", "基站", "频谱",
  "算法", "数据", "大数据", "云计算", "边缘计算", "分布式", "云服务", "SaaS", "PaaS", "IaaS",
  "APP", "应用", "软件", "操作系统", "浏览器", "搜索引擎", "推荐系统",
  "智能", "自动驾驶", "机器人", "无人机", "智能制造", "工业互联网", "物联网",
  "HBM", "GPU", "CPU", "TPU", "NPU", "算力", "数据中心", "服务器", "超算",
  "深度学习", "机器学习", "神经网络", "计算机视觉", "NLP", "自然语言处理",
  "生成式AI", "AIGC", "文生图", "图生图", "数字人", "虚拟偶像",

  // ========== 能源/环境 ==========
  "石油", "天然气", "煤炭", "电力", "核能", "气候", "环保", "减排", "碳达峰", "碳中和",
  "电动汽车", "充电桩", "换电站", "动力电池", "正极", "负极", "电解液", "隔膜",
  "风电", "光伏", "太阳能", "光热", "水电", "火电", "电网", "特高压",

  // ========== 交通 ==========
  "高铁", "地铁", "轻轨", "航空", "机场", "航空公司", "汽车", "车企", "新能源车",
  "造船", "港口", "航运", "物流", "快递", "供应链", "仓储",

  // ========== 医疗健康 ==========
  "疫苗", "药物", "创新药", "仿制药", "生物药", "中药", "医疗器械", "诊断",
  "医院", "诊所", "互联网医疗", "远程医疗", "AI医疗", "基因治疗", "细胞治疗",
  "医保", "集采", "带量采购", "DRG", "病案", "临床", "试验", "FDA", "NMPA",

  // ========== 教育 ==========
  "高考", "中考", "考研", "留学", "职业教育", "在线教育", "教培", "双减",
  "大学", "高校", "科研", "论文", "学术", "学位", "毕业", "就业",

  // ========== 房地产 ==========
  "房地产", "楼市", "房价", "二手房", "新房", "房贷", "利率", "限购", "限售",
  "保障房", "公租房", "共有产权", "学区房", "开发商", "房企", "碧桂园", "万科",

  // ========== 文娱体育 ==========
  "电影", "电视剧", "综艺", "明星", "艺人", "网红", "主播", "直播", "短视频",
  "奥运会", "亚运会", "世界杯", "NBA", "CBA", "中超", "英超", "西甲", "欧冠",
  "电竞", "游戏", "手游", "端游", "主机游戏", "Steam", "Epic", "腾讯游戏", "网易游戏",

  // ========== 法律/政策 ==========
  "法律", "法规", "政策", "监管", "罚款", "违法", "犯罪", "诉讼", "仲裁", "合规",
  "反垄断", "数据安全", "网络安全", "个人信息保护", "隐私", "算法备案",

  // ========== 企业/公司（补充） ==========
  "网易", "格力博", "迈为股份", "中银", "同心医疗", "京东", "拼多多", "美团", "滴滴",
  "快手", "B站", "哔哩哔哩", "小红书", "抖音", "字节", "微博", "知乎", "bilibili",
  "比亚迪", "理想", "蔚来", "小鹏", "吉利", "长城", "长安", "奇瑞",
  "台积电", "联发科", "中芯国际", "华为海思", "紫光", "长江存储",
  "携程", "去哪儿", "同程", "飞猪", "美团", "饿了么", "大众点评",
  "字节跳动", "TikTok", "抖音", "今日头条", "西瓜视频",
  "蚂蚁集团", "支付宝", "微信支付", "云闪付",

  // ========== 金融科技 ==========
  "央行数字货币", "DCEP", "数字人民币", "区块链", "去中心化", "DeFi", "CeFi",
  "量化交易", "高频交易", "程序化交易", "套利", "对冲", "期货", "期权", "衍生品",

  // ========== 新兴技术 ==========
  "量子计算", "量子通信", "6G", "卫星互联网", "低轨卫星", "空天飞机",
  "脑机接口", "脑机", " Neuralink", "基因编辑", "CRISPR", "mRNA",

  // ========== 消费品牌 ==========
  "茅台", "五粮液", "可口可乐", "百事", "星巴克", "瑞幸", "喜茶", "奈雪",
  "耐克", "阿迪达斯", "优衣库", "Zara", "H&M", "Shein", "Temu",

  // ========== 地方/区域 ==========
  "北京", "上海", "深圳", "广州", "杭州", "成都", "重庆", "武汉", "西安", "南京",
  "长三角", "珠三角", "京津冀", "大湾区", "雄安", "海南自贸港", "横琴", "前海",

  // ========== 行业术语 ==========
  "数字化转型", "智慧城市", "智慧交通", "智慧医疗", "智慧教育", "智能家居",
  "工业4.0", "工业互联网", "智能制造", "绿色制造", "服务型制造",
  "共同富裕", "乡村振兴", "新型城镇化", "区域协调", "内循环", "双循环",
];

// 黑名单
const TAG_BLACKLIST = new Set([
  // 通用词
  "新闻", "资讯", "消息", "报道", "文章", "内容", "信息", "动态",
  "最新", "今日", "热门", "爆款", "分享", "推荐", "精选", "必读",
  "关注", "聚焦", "深度", "解读", "分析", "观察", "评论", "观点",
  // 媒体类型
  "图文", "视频", "音频", "直播", "短视频", "长文", "快讯", "简报",
  // 时间相关
  "今天", "昨天", "本周", "本月", "近期", "目前", "当前", "正在",
  // 量词/形容词
  "多个", "一些", "众多", "大量", "首批", "首个", "独家", "重磅", "突发",
  "正式", "宣布", "透露", "曝光", "披露", "消息人士", "知情人士",
  // 操作词
  "点击", "查看", "阅读", "下载", "收藏", "转发", "点赞", "评论", "分享",
  // 地点（过于宽泛）
  "国内", "国外", "海外", "全球", "全国", "各地", "地方", "全球",
  // 其他
  "相关", "更多", "详情", "全文", "原文", "链接", "网址",
  // 动词
  "表示", "称", "指出", "认为", "强调", "透露", "宣布", "披露", "曝光",
  "称", "据悉", "了解到", "发现", "显示", "表明", "意味着", "意味着",
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

/**
 * 使用 Cloudflare Workers AI REST API 批量提取标签
 * 为了减少 API 调用，将多条新闻合并成一个请求
 */
async function extractTagsWithAI(
  items: Array<{ id: string; title: string; url: string }>,
  accountId: string,
  apiToken: string
): Promise<{ results: NewsItemWithTags[]; quotaExceeded: boolean; apiCalls: number }> {
  const BATCH_SIZE = 20; // 每批处理 20 条
  const results: NewsItemWithTags[] = [];
  let quotaExceeded = false;
  let apiCalls = 0;

  // Cloudflare Workers AI REST API endpoint
  const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`;

  // 分批处理
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    // 构建提示词
    const batchText = batch.map((item, idx) =>
      `${idx + 1}. ${item.title}`
    ).join('\n');

    const prompt = `分析以下新闻标题，提取每个新闻的 3-5 个关键词标签。
标签要求：实体名（人名、公司、国家）、事件类型、行业领域。
只返回 JSON 格式，格式为：[{"index":1,"tags":["标签1","标签2"]},{"index":2,...}]

新闻标题：
${batchText}`;

    try {
      apiCalls++;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: '你是一个新闻标签提取助手。只返回 JSON 格式的标签，不要其他内容。' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1000,
        }),
      });

      // 检查配额超限错误
      if (response.status === 429) {
        const errorText = await response.text();
        console.error(`[trends/scan] ⚠️  AI 配额超限! HTTP 429: ${errorText}`);
        console.error(`[trends/scan] 本次已使用 ${apiCalls}/${Math.ceil(items.length / BATCH_SIZE)} 次 API 调用`);
        console.error(`[trends/scan] 建议: 1) 降低刷新频率 2) 减少数据源数量`);
        quotaExceeded = true;
        throw new Error('QUOTA_EXCEEDED');
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[trends/scan] AI API error: ${response.status} ${errorText}`);
        throw new Error(`AI API failed: ${response.status}`);
      }

      const data = await response.json();
      const aiText = data.result?.response || data.response || '';

      if (!aiText) {
        throw new Error('Empty AI response');
      }

      console.log(`[trends/scan] AI batch ${i / BATCH_SIZE + 1}/${Math.ceil(items.length / BATCH_SIZE)} response: ${aiText.substring(0, 200)}...`);

      // 解析 AI 返回的 JSON
      let aiTags: Array<{ index: number; tags: string[] }> = [];
      try {
        // 尝试提取 JSON 部分（AI 可能返回额外文本）
        const jsonMatch = aiText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          aiTags = JSON.parse(jsonMatch[0]);
        } else {
          aiTags = JSON.parse(aiText);
        }
      } catch (e) {
        console.warn('[trends/scan] Failed to parse AI response, using keyword fallback');
        aiTags = [];
      }

      // 处理每条新闻的标签
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const aiTagData = aiTags.find(t => t.index === j + 1);

        let tags: string[];
        if (aiTagData?.tags && Array.isArray(aiTagData.tags)) {
          tags = aiTagData.tags.filter(t => !TAG_BLACKLIST.has(t));
        } else {
          // AI 失败，回退到关键词匹配
          tags = extractKeywords(item.title).filter(t => !TAG_BLACKLIST.has(t));
        }

        results.push({
          id: item.id,
          title: item.title,
          url: item.url,
          tags: tags.slice(0, 5), // 最多 5 个标签
          tagScore: tags.length > 0 ? 80 : 0,
        });
      }

      // 添加延迟避免速率限制
      if (i + BATCH_SIZE < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      const isQuotaError = error instanceof Error && error.message === 'QUOTA_EXCEEDED';
      if (isQuotaError) {
        // 配额超限，回退到关键词匹配
        console.error(`[trends/scan] 配额超限，回退到关键词匹配模式`);
        quotaExceeded = true;
      } else {
        console.error(`[trends/scan] AI batch ${i / BATCH_SIZE + 1} failed:`, error);
      }
      // 回退到关键词匹配
      for (const item of batch) {
        const rawTags = extractKeywords(item.title);
        results.push({
          id: item.id,
          title: item.title,
          url: item.url,
          tags: rawTags.filter(t => !TAG_BLACKLIST.has(t)),
          tagScore: rawTags.length > 0 ? 60 : 0,
        });
      }
    }
  }

  console.log(`[trends/scan] AI 处理完成: ${results.length} 条, API 调用 ${apiCalls} 次, 配额超限: ${quotaExceeded}`);
  return { results, quotaExceeded, apiCalls };
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
  aiQuotaExceeded?: boolean;  // AI 配额是否超限
  aiApiCalls?: number;        // 本次使用的 AI 调用次数
}

/**
 * 保存标签快照到 D1 数据库（用于历史趋势分析）
 */
async function saveTagSnapshots(
  d1: D1Database,
  scanTime: string,
  topTags: TagStats[],
  period: string = '4h'
): Promise<void> {
  try {
    const stmt = d1.prepare(
      'INSERT INTO tag_snapshots (scan_time, tag, count, rank, period) VALUES (?, ?, ?, ?, ?)'
    );

    // 批量插入所有标签快照
    const statements = topTags.map((tag, index) =>
      stmt.bind(scanTime, tag.tag, tag.count, index + 1, period)
    );

    await d1.batch(statements);
    console.log(`[trends/scan] Saved ${topTags.length} tag snapshots to D1`);
  } catch (error) {
    console.error('[trends/scan] Failed to save tag snapshots:', error);
    // 不抛出错误，避免影响主流程
  }
}

export async function GET({ locals, url }: { locals: App.Locals; url: URL }) {
  const kv = requireKV(locals);
  const d1 = requireD1(locals);
  const env = getEnv(locals) as any;
  const forceRefresh = url.searchParams.get('force') === 'true';
  const useAI = url.searchParams.get('ai') === 'true'; // AI 模式开关

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

    console.log(`[trends/scan] Processing ${data.items.length} news items, AI mode: ${useAI}`);

    // 处理新闻：提取关键词
    let newsWithTags: NewsItemWithTags[];

    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = env.CLOUDFLARE_API_TOKEN;

    let aiQuotaExceeded = false;
    let aiApiCalls = 0;

    if (useAI && accountId && apiToken) {
      // AI 模式：使用 REST API 批量处理
      console.log(`[trends/scan] Using AI mode with ${data.items.length} items`);
      const aiResult = await extractTagsWithAI(data.items, accountId, apiToken);
      newsWithTags = aiResult.results;
      aiQuotaExceeded = aiResult.quotaExceeded;
      aiApiCalls = aiResult.apiCalls;
    } else {
      // 关键词匹配模式
      newsWithTags = data.items.map(item => {
        const rawTags = extractKeywords(item.title);
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
    }

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

    // 保存标签快照到 D1（用于历史趋势分析）
    const scanTime = new Date().toISOString();
    await saveTagSnapshots(d1, scanTime, topTags, '4h');

    // 构建报告
    const report: TrendReport = {
      generatedAt: scanTime,
      newsCount: data.count,
      sources: data.sources,
      topTags,
      recentNews: newsWithTags.slice(0, 20), // 只返回前20条新闻
      aiQuotaExceeded,
      aiApiCalls,
    };

    // 配额超限警告
    if (aiQuotaExceeded) {
      console.warn(`[trends/scan] ⚠️  AI 配额已超限! 本次使用 ${aiApiCalls} 次 API 调用`);
      console.warn(`[trends/scan] 建议: 1) 降低刷新频率 2) 减少数据源数量`);
    }

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
