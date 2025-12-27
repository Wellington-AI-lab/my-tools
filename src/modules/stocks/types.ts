export type WeightInput = { symbol: string; weight: number };

export type PricePoint = {
  date: string; // YYYY-MM-DD
  close: number;
};

export type ValuePoint = {
  date: string; // YYYY-MM-DD
  value: number; // 净值（从 1 开始）
};

export type DrawdownInfo = {
  peakDate: string;
  troughDate: string;
  recoveryDate: string | null; // 如果未恢复则为 null
  drawdownPct: number; // 回撤百分比（正数）
};

export type EntryEvent = {
  date: string; // 入场日期 YYYY-MM-DD
  symbol: string; // 股票代码
};

export type BacktestResult = {
  cagr: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  actualStartDate: string;
  actualEndDate: string;
  providerBySymbol: Record<string, string>;
  notes: string[];
  // 用于图表
  valueSeries?: ValuePoint[];
  maxDrawdownInfo?: DrawdownInfo;
  // 动态入场事件
  entryEvents?: EntryEvent[];
};


