import type { TrendTheme } from '@/modules/trends/types';

export const THEME_KEYWORDS: Record<TrendTheme, { zh: string[]; en: string[] }> = {
  finance: {
    zh: ['股', '股票', '基金', '债', '利率', '汇率', '黄金', '原油', '比特币', '加密', '港股', '美股', 'A股', '期货'],
    en: ['stock', 'stocks', 'bond', 'bonds', 'yield', 'rate', 'rates', 'forex', 'gold', 'oil', 'bitcoin', 'crypto', 'ETF'],
  },
  economy: {
    zh: ['通胀', 'CPI', 'PPI', 'GDP', '失业', '就业', '房地产', '楼市', '消费', '出口', '制造业', 'PMI'],
    en: ['inflation', 'CPI', 'PPI', 'GDP', 'unemployment', 'jobs', 'housing', 'real estate', 'consumer', 'export', 'manufacturing', 'PMI'],
  },
  ai: {
    zh: ['大模型', 'AI', '人工智能', 'Agent', '推理', '算力', '芯片', 'NVIDIA', '英伟达', 'OpenAI', 'DeepSeek', 'Claude'],
    en: ['AI', 'artificial intelligence', 'LLM', 'agent', 'inference', 'compute', 'chip', 'NVIDIA', 'OpenAI', 'DeepSeek', 'Claude'],
  },
  robotics: {
    zh: ['机器人', '人形', '具身', '自动驾驶', '无人机', '机械臂', 'AGV', '工业机器人', '伺服', '传感器'],
    en: ['robot', 'robots', 'robotics', 'humanoid', 'embodied', 'drone', 'drones', 'autonomous', 'AGV', 'industrial robot', 'servo', 'sensor'],
  },
  travel: {
    zh: ['旅游', '旅行', '机票', '酒店', '签证', '攻略', 'Citywalk', '民宿', '航班', '免签'],
    en: ['travel', 'trip', 'flights', 'hotel', 'visa', 'itinerary', 'citywalk', 'airline', 'airlines'],
  },
  music: {
    zh: ['新歌', '演唱会', '专辑', '巡演', '音乐节', '榜单', '歌词', 'MV'],
    en: ['song', 'songs', 'album', 'albums', 'concert', 'tour', 'festival', 'chart', 'charts', 'lyrics', 'MV'],
  },
  movies: {
    zh: ['电影', '票房', '上映', '导演', '主演', '预告', '奥斯卡', '影评'],
    en: ['movie', 'movies', 'box office', 'premiere', 'director', 'trailer', 'Oscars', 'review'],
  },
  fashion: {
    zh: ['穿搭', '时尚', '秀场', '潮牌', '搭配', '香水', '面霜', '护肤', '口红', '包'],
    en: ['fashion', 'outfit', 'runway', 'streetwear', 'style', 'perfume', 'skincare', 'makeup', 'lipstick', 'bag', 'bags'],
  },
  entertainment: {
    zh: ['综艺', '明星', '热搜', '八卦', '剧', '电视剧', '演员', '发布会'],
    en: ['celebrity', 'celeb', 'show', 'shows', 'drama', 'TV', 'actor', 'actress', 'premiere'],
  },
};

export const ALL_THEMES: TrendTheme[] = [
  'finance',
  'economy',
  'ai',
  'robotics',
  'travel',
  'music',
  'movies',
  'fashion',
  'entertainment',
];


