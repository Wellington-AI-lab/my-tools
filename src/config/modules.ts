export type ModuleId = 'stocks' | 'telegram' | 'in-depth-analysis' | 'trends';

export type ModuleDef = {
  id: ModuleId;
  name: string;
  description: string;
  href: string;
  status?: 'beta' | 'alpha' | 'stable';
};

export const MODULES: ModuleDef[] = [
  {
    id: 'trends',
    name: '社会热点扫描',
    description: '扫描社会热点，用AI标注新闻',
    href: '/tools/trends',
    status: 'stable',
  },
  {
    id: 'stocks',
    name: '股票组合模拟收益率回测',
    description: '',
    href: '/tools/stocks',
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
];


