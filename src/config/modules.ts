export type ModuleId = 'stocks' | 'telegram' | 'in-depth-analysis' | 'news' | 'admin' | 'rsshub';

export type ModuleDef = {
  id: ModuleId;
  name: string;
  description: string;
  href: string;
  status?: 'beta' | 'alpha' | 'stable';
  adminOnly?: boolean;
  external?: boolean;
};

export const MODULES: ModuleDef[] = [
  {
    id: 'stocks',
    name: '股票组合模拟收益率回测',
    description: '',
    href: '/tools/stocks',
    status: 'stable',
  },
  {
    id: 'news',
    name: '新闻聚合',
    description: '聚合 V2EX、HackerNews、36氪等科技资讯',
    href: '/tools/news',
    status: 'stable',
  },
  {
    id: 'in-depth-analysis',
    name: '深度分析',
    description: '根据趋势雷达扫描出的信息标签进行多源检索',
    href: '/tools/deep-analysis',
    status: 'beta',
  },
  {
    id: 'telegram',
    name: 'Telegram 信号整合',
    description: '信号归档、标签化，并联动标的池（占位）',
    href: '/tools/telegram',
    status: 'beta',
  },
  {
    id: 'admin',
    name: '数据源管理',
    description: '管理新闻聚合的 RSS/RSSHub 数据源',
    href: '/tools/admin',
    status: 'stable',
    adminOnly: true,
  },
  {
    id: 'rsshub',
    name: 'RSSHub',
    description: '万物皆可 RSS - 支持数千种网站的 RSS 订阅生成',
    href: 'https://rsshub-fork-ai.vercel.app',
    status: 'stable',
    external: true,
  },
];


