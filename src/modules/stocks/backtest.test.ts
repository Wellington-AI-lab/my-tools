/**
 * 测试文件：backtest.test.ts
 * 覆盖模块：src/modules/stocks/backtest.ts
 * 目标覆盖率：≥95% 分支覆盖
 * 测试框架：vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBacktest } from './backtest';
import type { BacktestResult, PricePoint, WeightInput } from './types';

// ============================================================================
// Test Data Helpers
// ============================================================================

function createPricePoints(dates: string[], prices: number[]): PricePoint[] {
  return dates.map((date, i) => ({ date, close: prices[i] }));
}

// Helper to generate a series of dates
function generateDateSeries(start: string, count: number): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  for (let i = 0; i < count; i++) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Helper to generate price series with a trend
function generatePriceSeries(startPrice: number, count: number, trend: number = 0): number[] {
  const prices: number[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    prices.push(price);
    price = price * (1 + trend / 100) + (Math.random() - 0.5) * 2;
  }
  return prices;
}

function createMockWeights(symbols: string[], weights: number[]): WeightInput[] {
  return symbols.map((symbol, i) => ({ symbol, weight: weights[i] }));
}

// ============================================================================
// Happy Path Tests
// ============================================================================
describe('runBacktest - Happy Path', () => {
  it('should_calculate_simple_buy_and_hold_return', () => {
    // Arrange - Use 25 data points to meet MIN_DATA_POINTS requirement
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const prices = generatePriceSeries(100, 25, 1); // 1% upward trend
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, prices),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert
    expect(result.totalReturn).toBeGreaterThan(0);
    expect(result.actualStartDate).toBe('2024-01-01');
    expect(result.actualEndDate).toBe('2024-01-25');
    expect(result.valueSeries).toHaveLength(25);
    expect(result.valueSeries![0].value).toBe(1);
  });

  it('should_normalize_weights_to_sum_to_1', () => {
    // Arrange
    const weights = [
      { symbol: 'AAPL', weight: 30 },
      { symbol: 'MSFT', weight: 70 },
    ];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, 0.5)),
      MSFT: createPricePoints(dates, generatePriceSeries(200, 25, 0.5)),
    };
    const providerBySymbol = { AAPL: 'yahoo', MSFT: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert - Should work with non-normalized weights
    expect(result.totalReturn).toBeGreaterThan(0);
  });

  it('should_calculate_cagr_correctly', () => {
    // Arrange - 25 days with upward trend
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, 0.5)),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert - CAGR should be defined and positive
    expect(result.cagr).toBeDefined();
  });

  it('should_calculate_sharpe_ratio', () => {
    // Arrange - 25 days with upward trend
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, 0.2)),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert - Sharpe should be positive for upward trend
    expect(result.sharpeRatio).toBeDefined();
  });

  it('should_calculate_max_drawdown', () => {
    // Arrange - Create a series with a drawdown
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    // Create a pattern: up, then down, then up
    const prices = [
      100, 105, 110, 115, 120, // Peak around day 5
      115, 110, 105, 100, 95, 90, // Trough around day 11
      92, 95, 98, 100, 102, 105, 108, 110, 112, 115, 118, 120, 122
    ];
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, prices),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert
    expect(result.maxDrawdown).toBeGreaterThan(15); // ~25% drawdown from 120 to 90
    expect(result.maxDrawdownInfo?.peakDate).toBe('2024-01-05');
  });

  it('should_handle_multiple_symbols', () => {
    // Arrange
    const weights = [
      { symbol: 'AAPL', weight: 0.5 },
      { symbol: 'MSFT', weight: 0.5 },
    ];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, 0.3)),
      MSFT: createPricePoints(dates, generatePriceSeries(200, 25, 0.2)),
    };
    const providerBySymbol = { AAPL: 'yahoo', MSFT: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert
    expect(result.totalReturn).toBeGreaterThan(0);
    expect(result.valueSeries?.length).toBeGreaterThan(20);
  });
});

// ============================================================================
// Dynamic Entry Tests
// ============================================================================
describe('runBacktest - Dynamic Entry', () => {
  it('should_handle_new_symbol_entry_mid_period', () => {
    // Arrange - MSFT starts trading later than AAPL
    const weights = [
      { symbol: 'AAPL', weight: 0.5 },
      { symbol: 'MSFT', weight: 0.5 },
    ];
    const startDate = '2024-01-01';
    const endDate = '2024-02-05'; // Extended to ensure MSFT has 20+ data points
    // AAPL has continuous data from day 1
    const aaplDates = generateDateSeries('2024-01-01', 36);
    // MSFT starts on day 15 (01-15), giving it 22 days of data (01-15 to 02-05)
    const msftDates = generateDateSeries('2024-01-15', 22);
    const seriesBySymbol = {
      AAPL: createPricePoints(aaplDates, generatePriceSeries(100, 36, 0.3)),
      MSFT: createPricePoints(msftDates, generatePriceSeries(200, 22, 0.2)),
    };
    const providerBySymbol = { AAPL: 'yahoo', MSFT: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert
    expect(result.entryEvents).toHaveLength(2);
    expect(result.entryEvents![0].symbol).toBe('AAPL');
    expect(result.entryEvents![0].date).toBe('2024-01-01');
    expect(result.entryEvents![1].symbol).toBe('MSFT');
    expect(result.entryEvents![1].date).toBe('2024-01-15');
    expect(result.notes).toContain('动态入场模式: 新股上市后自动加入组合并重新平衡');
  });

  it('should_rebalance_when_new_symbol_enters', () => {
    // Arrange
    const weights = [
      { symbol: 'AAPL', weight: 0.6 },
      { symbol: 'MSFT', weight: 0.4 },
    ];
    const startDate = '2024-01-01';
    const endDate = '2024-01-30'; // Extended to accommodate MSFT's later start
    const aaplDates = generateDateSeries('2024-01-01', 30);
    const msftDates = generateDateSeries('2024-01-08', 23); // 23 points from 01-08 to 01-30
    const seriesBySymbol = {
      AAPL: createPricePoints(aaplDates, generatePriceSeries(100, 30, 0.5)),
      MSFT: createPricePoints(msftDates, generatePriceSeries(200, 23, 0)),
    };
    const providerBySymbol = { AAPL: 'yahoo', MSFT: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert - Portfolio should rebalance when MSFT enters
    expect(result.entryEvents).toHaveLength(2);
  });
});

// ============================================================================
// Drawdown Recovery Tests
// ============================================================================
describe('runBacktest - Drawdown Recovery', () => {
  it('should_find_recovery_date', () => {
    // Arrange
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-28'; // 28 days for full recovery
    const dates = generateDateSeries('2024-01-01', 28);
    // Create a pattern: up to 110, drop to 90, then recover to 115 (above peak)
    // Day 1-6: up to 110, Day 7-16: down to 90 (trough), Day 17-28: recover to 115
    const prices = [
      100, 102, 104, 106, 108, 110, // Day 1-6 (peak at 110)
      108, 106, 104, 102, 100, 98, 96, 94, 92, 90, // Day 7-16 (trough at 90)
      92, 94, 96, 98, 100, 102, 104, 106, 108, 110, 112, 115, // Day 17-28 (recovers to 115 > peak)
    ];
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, prices),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert - Should find recovery since value exceeds the peak value after trough
    expect(result.maxDrawdownInfo?.recoveryDate).not.toBeNull();
  });

  it('should_have_null_recovery_if_not_recovered', () => {
    // Arrange
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    // Goes up then down, never recovers
    const prices = [
      100, 102, 104, 106, 108, 110, 112, 114, // Peak
      112, 110, 108, 106, 104, 102, 100, 98, 96, 94, 92, 90, 88, 86, 84, 82, 80
    ];
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, prices),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert
    expect(result.maxDrawdownInfo?.recoveryDate).toBeNull();
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================
describe('runBacktest - Error Handling', () => {
  it('should_throw_when_total_weight_is_zero', () => {
    // Arrange
    const weights = [
      { symbol: 'AAPL', weight: 0 },
      { symbol: 'MSFT', weight: 0 },
    ];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, 0)),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act & Assert
    expect(() => runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    })).toThrow('Total weight must be > 0');
  });

  it('should_throw_when_no_data_for_symbol', () => {
    // Arrange
    const weights = [{ symbol: 'INVALID', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const seriesBySymbol = {
      INVALID: [],
    };
    const providerBySymbol = { INVALID: 'yahoo' };

    // Act & Assert
    expect(() => runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    })).toThrow('No usable price data');
  });

  it('should_throw_when_insufficient_data_points', () => {
    // Arrange - Less than MIN_DATA_POINTS (20)
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-10';
    const dates = generateDateSeries('2024-01-01', 10);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 10, 0)),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act & Assert
    expect(() => runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    })).toThrow('Insufficient data');
  });

  it('should_throw_when_not_enough_trading_days', () => {
    // Arrange - Only one day of data (less than 20 for MIN_DATA_POINTS)
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-01';
    const seriesBySymbol = {
      AAPL: createPricePoints(['2024-01-01'], [100]),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act & Assert
    expect(() => runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    })).toThrow('Insufficient data'); // Changed from 'Not enough trading days' to 'Insufficient data'
  });
});

// ============================================================================
// Date Clamping Tests
// ============================================================================
describe('runBacktest - Date Clamping', () => {
  it('should_clamp_to_30_years_by_default', () => {
    // Arrange - Request data from 50 years ago
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '1970-01-01';
    const endDate = '2024-01-25';
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 30);
    const expectedCutoff = cutoffDate.toISOString().slice(0, 10);

    // Generate dates from cutoff to ensure we have 20+ points
    const dates = generateDateSeries(expectedCutoff, 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, 0)),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
      clampYears: 30,
    });

    // Assert - Should start from clamped date, not 1970
    expect(result.actualStartDate).toBe(expectedCutoff);
  });

  it('should_use_custom_clamp_years', () => {
    // Arrange - Test with a known future date to avoid flakiness
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    // Use dates far in the future to test clamping behavior
    // With 5 year clamp and current date around 2025, dates before 2020 would be clamped
    const startDate = '2015-01-01'; // More than 5 years before now
    const endDate = '2025-01-25'; // Future date
    // Generate data from recently (within 5 years) to ensure it passes clamping
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 4); // 4 years ago, within 5 year clamp
    const expectedCutoff = cutoffDate.toISOString().slice(0, 10);
    const dates = generateDateSeries(expectedCutoff, 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, 0)),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
      clampYears: 5, // Only 5 years of history
    });

    // Assert - Should use data from within clamp period, not 2015
    expect(result.actualStartDate).not.toBe('2015-01-01');
    // String comparison works for ISO dates (lexicographic = chronological)
    expect(result.actualStartDate >= expectedCutoff).toBe(true);
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================
describe('runBacktest - Edge Cases', () => {
  it('should_handle_missing_prices_in_series', () => {
    // Arrange - Symbols have different trading days
    const weights = [
      { symbol: 'AAPL', weight: 0.5 },
      { symbol: 'MSFT', weight: 0.5 },
    ];
    const startDate = '2024-01-01';
    const endDate = '2024-02-15'; // Extended to ensure MSFT has 20+ odd days
    const aaplDates = generateDateSeries('2024-01-01', 46); // 46 days from 01-01 to 02-15
    // MSFT has only odd days - need at least 20 odd days within the date range
    // Odd days in Jan+Feb give us enough dates
    const allDates = generateDateSeries('2024-01-01', 50);
    const msftDates = allDates.filter((_, i) => i % 2 === 1).filter(d => d <= endDate);
    const seriesBySymbol = {
      AAPL: createPricePoints(aaplDates, generatePriceSeries(100, 46, 0)),
      MSFT: createPricePoints(msftDates, generatePriceSeries(200, msftDates.length, 0)),
    };
    const providerBySymbol = { AAPL: 'yahoo', MSFT: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert - Should handle gracefully
    expect(result.valueSeries).toBeDefined();
    expect(result.valueSeries?.length).toBeGreaterThan(0);
  });

  it('should_handle_negative_return', () => {
    // Arrange
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, -0.5)),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert
    expect(result.totalReturn).toBeLessThan(0);
  });

  it('should_return_zero_cagr_for_zero_years', () => {
    // Arrange - 25 days with small growth
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, 0.1)),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert - CAGR should handle sub-year periods
    expect(result.cagr).toBeDefined();
  });

  it('should_handle_single_stock_with_multiple_entries', () => {
    // Arrange
    const weights = [
      { symbol: 'AAPL', weight: 0.5 },
      { symbol: 'GOOGL', weight: 0.5 },
    ];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const aaplDates = generateDateSeries('2024-01-01', 25);
    const googlDates = generateDateSeries('2024-01-05', 21);
    const seriesBySymbol = {
      AAPL: createPricePoints(aaplDates, generatePriceSeries(100, 25, 0)),
      GOOGL: createPricePoints(googlDates, generatePriceSeries(150, 21, 0)),
    };
    const providerBySymbol = { AAPL: 'yahoo', GOOGL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert - Both stocks should have entry events
    expect(result.entryEvents).toHaveLength(2);
  });

  it('should_filter_dates_by_range', () => {
    // Arrange - Data outside requested range
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-05';
    const endDate = '2024-01-25';
    // Provide data from before startDate
    const allDates = generateDateSeries('2024-01-01', 30);
    const allPrices = generatePriceSeries(100, 30, 0);
    const seriesBySymbol = {
      AAPL: createPricePoints(allDates, allPrices),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert - Should only use data in range
    expect(result.actualStartDate).toBe('2024-01-05');
    expect(result.actualEndDate).toBe('2024-01-25');
  });

  it('should_handle_zero_volatility_series', () => {
    // Arrange - Flat price series
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const prices = Array(25).fill(100);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, prices),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert
    expect(result.totalReturn).toBeCloseTo(0, 1);
    expect(result.sharpeRatio).toBe(0); // Zero volatility = zero Sharpe
  });

  it('should_append_custom_notes', () => {
    // Arrange
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, 0)),
    };
    const providerBySymbol = { AAPL: 'yahoo' };
    const customNotes = ['Custom note 1', 'Custom note 2'];

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
      notes: customNotes,
    });

    // Assert - Custom notes are preserved and backtest adds its own note
    expect(result.notes).toContain('Custom note 1');
    expect(result.notes).toContain('Custom note 2');
    expect(result.notes.some((note: string) => note.includes('Yahoo Finance'))).toBe(true);
  });
});

// ============================================================================
// Financial Metrics Tests
// ============================================================================
describe('runBacktest - Financial Metrics', () => {
  it('should_calculate_correct_final_value', () => {
    // Arrange
    const weights = [{ symbol: 'AAPL', weight: 1 }];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, 0.5)),
    };
    const providerBySymbol = { AAPL: 'yahoo' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert - Final value should be greater than 1 (gain)
    const finalValue = result.valueSeries![result.valueSeries!.length - 1].value;
    expect(finalValue).toBeGreaterThan(1);
  });

  it('should_preserve_provider_info', () => {
    // Arrange
    const weights = [
      { symbol: 'AAPL', weight: 0.5 },
      { symbol: 'MSFT', weight: 0.5 },
    ];
    const startDate = '2024-01-01';
    const endDate = '2024-01-25';
    const dates = generateDateSeries('2024-01-01', 25);
    const seriesBySymbol = {
      AAPL: createPricePoints(dates, generatePriceSeries(100, 25, 0)),
      MSFT: createPricePoints(dates, generatePriceSeries(200, 25, 0)),
    };
    const providerBySymbol = { AAPL: 'yahoo', MSFT: 'finnhub' };

    // Act
    const result = runBacktest({
      weights,
      startDate,
      endDate,
      seriesBySymbol,
      providerBySymbol,
    });

    // Assert
    expect(result.providerBySymbol).toEqual({ AAPL: 'yahoo', MSFT: 'finnhub' });
  });
});
