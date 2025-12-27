export type ModuleId = 'stocks' | 'news' | 'telegram' | 'rednote' | 'trends';

export type ModuleDef = {
  id: ModuleId;
  name: string;
  description: string;
  href: string;
  status?: 'beta' | 'alpha' | 'stable';
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
    id: 'trends',
    name: 'Trend Radar',
    description: '多源趋势雷达（Google Trends RSS + 微博热搜）· 每日定时报告',
    href: '/tools/trends',
    status: 'beta',
  },
  {
    id: 'rednote',
    name: '信息流',
    description: '社交媒体信息流 → Funnel 过滤 → AI 洞察报告（SNR 优先）',
    href: '/tools/rednote-agent',
    status: 'beta',
  },
  {
    id: 'news',
    name: '新闻聚合',
    description: '围绕“标的池/标签”聚合、过滤、重点监控（占位）',
    href: '/tools/news',
    status: 'beta',
  },
  {
    id: 'telegram',
    name: 'Telegram 信号整合',
    description: '信号归档、标签化，并联动标的池（占位）',
    href: '/tools/telegram',
    status: 'beta',
  },
];


