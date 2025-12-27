import type { BacktestResult, DrawdownInfo, EntryEvent, PricePoint, ValuePoint, WeightInput } from '@/modules/stocks/types';

function clampToLastYears(startDate: string, years: number): string {
  const now = new Date();
  const d = new Date(`${startDate}T00:00:00.000Z`);
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return d < cutoff ? cutoff.toISOString().slice(0, 10) : startDate;
}

// 获取所有日期的并集（用于动态入场）
function getUnionDates(series: Record<string, PricePoint[]>): string[] {
  const allDates = new Set<string>();
  for (const pts of Object.values(series)) {
    for (const p of pts) {
      allDates.add(p.date);
    }
  }
  return Array.from(allDates).sort();
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

function sampleStdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function runBacktest(opts: {
  weights: WeightInput[];
  startDate: string;
  endDate: string;
  seriesBySymbol: Record<string, PricePoint[]>;
  providerBySymbol: Record<string, string>;
  clampYears?: number;
  notes?: string[];
}): BacktestResult {
  const clampYears = opts.clampYears ?? 30;
  const notes = [...(opts.notes ?? [])];

  // Normalize target weights
  const totalWeight = opts.weights.reduce((s, w) => s + (Number.isFinite(w.weight) ? w.weight : 0), 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    throw new Error('Total weight must be > 0');
  }
  const targetWeights = new Map(
    opts.weights.map((w) => [w.symbol, w.weight / totalWeight])
  );
  const allSymbols = opts.weights.map((w) => w.symbol);

  // Clamp to last N years
  const startDate = clampToLastYears(opts.startDate, clampYears);
  const endDate = opts.endDate;

  // Build price index for each symbol
  const priceIndex: Record<string, Map<string, number>> = {};
  const firstDateBySymbol: Record<string, string> = {};
  
  for (const symbol of allSymbols) {
    const pts = (opts.seriesBySymbol[symbol] ?? [])
      .filter((p) => p.date >= startDate && p.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    
    if (pts.length === 0) {
      throw new Error(`No usable price data in range for: ${symbol}`);
    }
    
    priceIndex[symbol] = new Map(pts.map((p) => [p.date, p.close]));
    firstDateBySymbol[symbol] = pts[0].date;
  }

  // Get all trading dates (union)
  const sliced: Record<string, PricePoint[]> = {};
  for (const symbol of allSymbols) {
    sliced[symbol] = (opts.seriesBySymbol[symbol] ?? [])
      .filter((p) => p.date >= startDate && p.date <= endDate);
  }
  const allDates = getUnionDates(sliced);
  
  if (allDates.length < 2) throw new Error('Not enough trading days');

  // 动态入场回测
  const values: Array<{ date: string; value: number }> = [];
  const shares: Record<string, number> = {}; // 当前持有股数
  let portfolioValue = 1; // 初始净值
  let activeSymbols = new Set<string>(); // 当前活跃的股票
  const entryEvents: EntryEvent[] = []; // 入场事件记录

  for (const d of allDates) {
    // 检查当天有数据的股票
    const availableToday = allSymbols.filter((s) => priceIndex[s].has(d));
    if (availableToday.length === 0) continue;

    // 检查是否有新股票入场
    const newEntries = availableToday.filter((s) => !activeSymbols.has(s));
    
    if (newEntries.length > 0 || activeSymbols.size === 0) {
      // 新股票入场，需要重新平衡
      
      // 1. 计算当前组合价值（如果已有持仓）
      if (activeSymbols.size > 0) {
        let currentValue = 0;
        for (const s of activeSymbols) {
          const price = priceIndex[s].get(d);
          if (price && shares[s]) {
            currentValue += shares[s] * price;
          }
        }
        portfolioValue = currentValue > 0 ? currentValue : portfolioValue;
      }

      // 2. 更新活跃股票集合
      for (const s of newEntries) {
        activeSymbols.add(s);
        entryEvents.push({ date: d, symbol: s });
      }

      // 3. 按目标权重重新分配（只分配给当前可用的股票）
      const activeList = Array.from(activeSymbols).filter((s) => priceIndex[s].has(d));
      const activeTotalWeight = activeList.reduce((sum, s) => sum + (targetWeights.get(s) || 0), 0);
      
      if (activeTotalWeight > 0) {
        for (const s of activeList) {
          const price = priceIndex[s].get(d);
          if (price && price > 0) {
            const normalizedWeight = (targetWeights.get(s) || 0) / activeTotalWeight;
            shares[s] = (portfolioValue * normalizedWeight) / price;
          }
        }
      }
    }

    // 计算当天组合价值
    let todayValue = 0;
    for (const s of activeSymbols) {
      const price = priceIndex[s].get(d);
      if (price && shares[s]) {
        todayValue += shares[s] * price;
      }
    }
    
    if (todayValue > 0) {
      portfolioValue = todayValue;
      values.push({ date: d, value: portfolioValue });
    }
  }

  if (values.length < 2) throw new Error('Not enough data points for backtest');

  // 计算最大回撤
  let maxValue = values[0].value;
  let maxDrawdown = 0;
  let peakDate = values[0].date;
  let maxDrawdownPeakDate = values[0].date;
  let maxDrawdownTroughDate = values[0].date;
  let maxDrawdownPeakValue = values[0].value;

  for (const { date, value } of values) {
    if (value > maxValue) {
      maxValue = value;
      peakDate = date;
    }
    
    const dd = (maxValue - value) / maxValue;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPeakDate = peakDate;
      maxDrawdownTroughDate = date;
      maxDrawdownPeakValue = maxValue;
    }
  }

  // 查找恢复日期
  let recoveryDate: string | null = null;
  let foundTrough = false;
  for (const { date, value } of values) {
    if (date === maxDrawdownTroughDate) foundTrough = true;
    if (foundTrough && value >= maxDrawdownPeakValue) {
      recoveryDate = date;
      break;
    }
  }

  const finalValue = values[values.length - 1].value;
  const totalReturn = (finalValue - 1) * 100;

  // CAGR
  const startTs = Date.parse(`${values[0].date}T00:00:00.000Z`);
  const endTs = Date.parse(`${values[values.length - 1].date}T00:00:00.000Z`);
  const years = (endTs - startTs) / (365.25 * 24 * 60 * 60 * 1000);
  const cagr = years > 0 ? (Math.pow(finalValue, 1 / years) - 1) * 100 : 0;

  // Sharpe ratio
  const dailyReturns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1].value;
    const cur = values[i].value;
    if (prev > 0) {
      dailyReturns.push((cur - prev) / prev);
    }
  }

  const avgDaily = mean(dailyReturns);
  const stdDaily = sampleStdDev(dailyReturns);
  const sharpeRatio = stdDaily > 0 ? (avgDaily * 252) / (stdDaily * Math.sqrt(252)) : 0;

  // Notes
  notes.push('数据来源: Yahoo Finance Adjusted Close（已调整分红和拆股）');
  if (entryEvents.length > 1) {
    notes.push('动态入场模式: 新股上市后自动加入组合并重新平衡');
  }

  const actualStartDate = values[0].date;
  const actualEndDate = values[values.length - 1].date;

  const valueSeries: ValuePoint[] = values.map(({ date, value }) => ({ date, value }));

  const maxDrawdownInfo: DrawdownInfo = {
    peakDate: maxDrawdownPeakDate,
    troughDate: maxDrawdownTroughDate,
    recoveryDate,
    drawdownPct: maxDrawdown * 100,
  };

  return {
    cagr: Number.isFinite(cagr) ? cagr : 0,
    totalReturn: Number.isFinite(totalReturn) ? totalReturn : 0,
    maxDrawdown: maxDrawdown * 100,
    sharpeRatio: Number.isFinite(sharpeRatio) ? sharpeRatio : 0,
    actualStartDate,
    actualEndDate,
    providerBySymbol: opts.providerBySymbol,
    notes,
    valueSeries,
    maxDrawdownInfo,
    entryEvents,
  };
}


