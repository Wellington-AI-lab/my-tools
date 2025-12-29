/**
 * Cost & Efficiency Dashboard - 成本与效率监控面板
 *
 * 显示:
 * - Cache Hit Ratio (缓存命中率) - 越高越好
 * - Burn Rate (估算成本) - USD
 * - Performance (延迟指标)
 * - Token Usage (token 使用情况)
 *
 * 使用轻量级设计，不增加额外加载负担
 */

import React, { useState, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

interface MetricsData {
  period: string;
  summary: {
    total_requests: number;
    cache_hit_ratio: number;
    cache_hit_rate: string;
    total_tokens: number;
    estimated_cost_usd: number;
    estimated_cost_formatted: string;
  };
  performance: {
    avg_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
    avg_latency_formatted: string;
  };
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cache: {
    hits: number;
    misses: number;
    ratio: number;
  };
  efficiency: {
    cost_per_1k_requests: number;
    tokens_per_request: number;
    savings_from_cache_usd: number;
  };
  recent_events: Array<{
    timestamp: number;
    endpoint: string;
    cache_hit: boolean;
    latency_ms: number;
    success: boolean;
  }>;
}

interface MetricsResponse {
  success: boolean;
  data?: MetricsData;
  error?: string;
  timestamp?: string;
}

interface Props {
  apiUrl?: string;
  adminSecret?: string;
  refreshInterval?: number;
  compact?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function getCacheHitColor(ratio: number): string {
  if (ratio >= 0.8) return '#22c55e';  // green
  if (ratio >= 0.5) return '#f59e0b';  // amber
  return '#ef4444';                  // red
}

function getLatencyColor(ms: number): string {
  if (ms < 500) return '#22c55e';
  if (ms < 2000) return '#f59e0b';
  return '#ef4444';
}

// ============================================================================
// Components
// ============================================================================

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
}

function MetricCard({ title, value, subtitle, color, trend }: MetricCardProps) {
  return (
    <div className="cd-metric-card">
      <div className="cd-metric-title">{title}</div>
      <div className="cd-metric-value" style={{ color }}>
        {value}
      </div>
      {subtitle && (
        <div className="cd-metric-subtitle">{subtitle}</div>
      )}
    </div>
  );
}

interface CacheHitIndicatorProps {
  ratio: number;
  rate: string;
  size?: 'sm' | 'md' | 'lg';
}

function CacheHitIndicator({ ratio, rate, size = 'md' }: CacheHitIndicatorProps) {
  const color = getCacheHitColor(ratio);
  const percentage = Math.round(ratio * 100);

  return (
    <div className={`cd-cache-indicator cd-cache-${size}`}>
      <div className="cd-cache-ring" style={{
        background: `conic-gradient(${color} ${percentage}%, #374151 ${percentage}%)`
      }}>
        <div className="cd-cache-inner">
          <span className="cd-cache-value" style={{ color }}>{rate}</span>
        </div>
      </div>
      <span className="cd-cache-label">Cache Hit</span>
    </div>
  );
}

interface RecentEventItemProps {
  event: MetricsData['recent_events'][0];
}

function RecentEventItem({ event }: RecentEventItemProps) {
  const latencyColor = getLatencyColor(event.latency_ms);

  return (
    <div className={`cd-event-item ${event.success ? '' : 'cd-event-failed'}`}>
      <span className="cd-event-time">{formatTimeAgo(event.timestamp)}</span>
      <span className="cd-event-endpoint">{event.endpoint}</span>
      <span className={`cd-event-cache ${event.cache_hit ? 'cd-cache-hit' : 'cd-cache-miss'}`}>
        {event.cache_hit ? '✓' : '○'}
      </span>
      <span className="cd-event-latency" style={{ color: latencyColor }}>
        {event.latency_ms}ms
      </span>
    </div>
  );
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

export function CostDashboard({
  apiUrl = '/api/admin/metrics',
  adminSecret,
  refreshInterval = 60000,
  compact = false,
}: Props) {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'24h' | '7d' | '30d' | 'total'>('24h');
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const headers: Record<string, string> = {};
      if (adminSecret) {
        headers['X-Admin-Secret'] = adminSecret;
      }

      const url = new URL(apiUrl, window.location.origin);
      url.searchParams.set('period', period);

      const response = await fetch(url.toString(), { headers });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized: Admin access required');
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data: MetricsResponse = await response.json();
      if (data.success && data.data) {
        setMetrics(data.data);
        setError(null);
      } else {
        const errorMsg = typeof data.error === 'string' ? data.error : 'Failed to load metrics';
        throw new Error(errorMsg);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchMetrics();
  }, [period]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(() => fetchMetrics(), refreshInterval);
      return () => clearInterval(interval);
    }
  }, [period, refreshInterval]);

  if (loading && !metrics) {
    return (
      <div className="cd-dashboard cd-loading">
        <div className="cd-spinner" />
        <p>Loading metrics...</p>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="cd-dashboard cd-error">
        <span className="cd-error-icon">⚠</span>
        <p>{error}</p>
        <button onClick={() => fetchMetrics()} className="cd-retry-btn">
          Retry
        </button>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const cacheColor = getCacheHitColor(metrics.cache.ratio);
  const latencyColor = getLatencyColor(metrics.performance.avg_latency_ms);

  return (
    <div className={`cd-dashboard ${compact ? 'cd-compact' : ''}`}>
      {/* Header */}
      <div className="cd-header">
        <h3 className="cd-title">Cost & Efficiency</h3>
        <div className="cd-controls">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            className="cd-period-select"
          >
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="total">All Time</option>
          </select>
          <button
            onClick={() => fetchMetrics(true)}
            className={`cd-refresh-btn ${refreshing ? 'cd-refreshing' : ''}`}
            disabled={refreshing}
          >
            <span className={`cd-refresh-icon ${refreshing ? 'cd-spin' : ''}`}>⟳</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="cd-metrics-grid">
        {/* Cache Hit Ratio */}
        <div className="cd-metric-card cd-primary">
          <div className="cd-metric-header">
            <span className="cd-metric-title">Efficiency</span>
            <CacheHitIndicator
              ratio={metrics.cache.ratio}
              rate={metrics.summary.cache_hit_rate}
              size="sm"
            />
          </div>
          <div className="cd-metric-details">
            <span>{metrics.cache.hits} hits / {metrics.cache.misses} misses</span>
          </div>
        </div>

        {/* Cost */}
        <div className="cd-metric-card cd-primary">
          <div className="cd-metric-header">
            <span className="cd-metric-title">Burn Rate</span>
            <span className="cd-metric-period">{metrics.period}</span>
          </div>
          <div className="cd-metric-value cd-cost">
            {metrics.summary.estimated_cost_formatted}
          </div>
          <div className="cd-metric-details">
            <span>{formatNumber(metrics.summary.total_tokens)} tokens</span>
          </div>
        </div>

        {/* Performance */}
        <div className="cd-metric-card cd-primary">
          <div className="cd-metric-header">
            <span className="cd-metric-title">Performance</span>
          </div>
          <div
            className="cd-metric-value"
            style={{ color: latencyColor }}
          >
            {metrics.performance.avg_latency_formatted}
          </div>
          <div className="cd-metric-details">
            <span>P95: {metrics.performance.p95_latency_ms}ms</span>
          </div>
        </div>
      </div>

      {!compact && (
        <>
          {/* Efficiency Breakdown */}
          <div className="cd-section">
            <h4 className="cd-section-title">Efficiency Breakdown</h4>
            <div className="cd-breakdown-grid">
              <MetricCard
                title="Cost per 1K Requests"
                value={`$${metrics.efficiency.cost_per_1k_requests.toFixed(3)}`}
              />
              <MetricCard
                title="Tokens per Request"
                value={metrics.efficiency.tokens_per_request}
              />
              <MetricCard
                title="Cache Savings"
                value={`$${metrics.efficiency.savings_from_cache_usd.toFixed(2)}`}
                color="#22c55e"
              />
              <MetricCard
                title="Total Requests"
                value={formatNumber(metrics.summary.total_requests)}
              />
            </div>
          </div>

          {/* Token Breakdown */}
          <div className="cd-section">
            <h4 className="cd-section-title">Token Usage</h4>
            <div className="cd-token-bar">
              <div
                className="cd-token-fill cd-token-input"
                style={{ width: `${(metrics.tokens.input / metrics.tokens.total) * 100}%` }}
              />
              <div
                className="cd-token-fill cd-token-output"
                style={{ width: `${(metrics.tokens.output / metrics.tokens.total) * 100}%` }}
              />
            </div>
            <div className="cd-token-legend">
              <span className="cd-token-label">
                <span className="cd-token-dot cd-token-input" />
                Input: {formatNumber(metrics.tokens.input)}
              </span>
              <span className="cd-token-label">
                <span className="cd-token-dot cd-token-output" />
                Output: {formatNumber(metrics.tokens.output)}
              </span>
            </div>
          </div>

          {/* Recent Events */}
          {metrics.recent_events.length > 0 && (
            <div className="cd-section">
              <h4 className="cd-section-title">Recent Activity</h4>
              <div className="cd-events-list">
                {metrics.recent_events.slice(0, 10).map((event, i) => (
                  <RecentEventItem key={i} event={event} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default CostDashboard;

// ============================================================================
// Inline Styles
// ============================================================================

export const costDashboardStyles = `
.cd-dashboard {
  --cd-bg-primary: #0a0a0a;
  --cd-bg-secondary: #111111;
  --cd-bg-tertiary: #1a1a1a;
  --cd-border: #222222;
  --cd-text-primary: #e5e5e5;
  --cd-text-secondary: #888888;
  --cd-text-tertiary: #444444;
  --cd-accent-blue: #3b82f6;
  --cd-accent-green: #22c55e;
  --cd-accent-amber: #f59e0b;
  --cd-accent-red: #ef4444;

  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--cd-text-primary);
  background: var(--cd-bg-secondary);
  border: 1px solid var(--cd-border);
  border-radius: 8px;
  padding: 16px;
}

/* Loading & Error States */
.cd-dashboard.cd-loading,
.cd-dashboard.cd-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
}

.cd-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--cd-border);
  border-top-color: var(--cd-text-secondary);
  border-radius: 50%;
  animation: cd-spin 1s linear infinite;
}

@keyframes cd-spin {
  to { transform: rotate(360deg); }
}

.cd-error-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.cd-retry-btn {
  margin-top: 16px;
  padding: 8px 16px;
  background: var(--cd-bg-tertiary);
  border: 1px solid var(--cd-border);
  border-radius: 4px;
  color: var(--cd-text-primary);
  cursor: pointer;
}

.cd-retry-btn:hover {
  background: var(--cd-border);
}

/* Compact Mode */
.cd-dashboard.cd-compact {
  padding: 12px;
}

.cd-dashboard.cd-compact .cd-section {
  display: none;
}

/* Header */
.cd-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.cd-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--cd-text-primary);
}

.cd-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cd-period-select {
  padding: 4px 8px;
  font-size: 11px;
  background: var(--cd-bg-tertiary);
  border: 1px solid var(--cd-border);
  border-radius: 4px;
  color: var(--cd-text-primary);
  cursor: pointer;
}

.cd-refresh-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--cd-border);
  border-radius: 4px;
  color: var(--cd-text-secondary);
  cursor: pointer;
}

.cd-refresh-btn:hover {
  background: var(--cd-bg-tertiary);
}

.cd-refresh-btn.cd-refreshing {
  opacity: 0.5;
}

.cd-refresh-icon.cd-spin {
  animation: cd-spin 1s linear infinite;
}

/* Metrics Grid */
.cd-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 640px) {
  .cd-metrics-grid {
    grid-template-columns: 1fr;
  }
}

.cd-metric-card {
  background: var(--cd-bg-tertiary);
  border: 1px solid var(--cd-border);
  border-radius: 6px;
  padding: 12px;
}

.cd-metric-card.cd-primary {
  padding: 16px;
}

.cd-metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.cd-metric-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cd-text-secondary);
}

.cd-metric-period {
  font-size: 9px;
  color: var(--cd-text-tertiary);
}

.cd-metric-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--cd-text-primary);
}

.cd-metric-value.cd-cost {
  color: var(--cd-accent-green);
}

.cd-metric-details {
  margin-top: 8px;
  font-size: 11px;
  color: var(--cd-text-tertiary);
}

/* Cache Hit Indicator */
.cd-cache-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.cd-cache-indicator.cd-cache-sm {
  flex-direction: row;
}

.cd-cache-indicator.cd-cache-sm .cd-cache-label {
  font-size: 9px;
}

.cd-cache-ring {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  position: relative;
}

.cd-cache-indicator.cd-cache-sm .cd-cache-ring {
  width: 24px;
  height: 24px;
}

.cd-cache-inner {
  position: absolute;
  inset: 2px;
  background: var(--cd-bg-tertiary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cd-cache-value {
  font-size: 10px;
  font-weight: 700;
}

.cd-cache-label {
  font-size: 10px;
  color: var(--cd-text-tertiary);
}

/* Section */
.cd-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--cd-border);
}

.cd-section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cd-text-secondary);
  margin-bottom: 12px;
}

/* Breakdown Grid */
.cd-breakdown-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

@media (max-width: 640px) {
  .cd-breakdown-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Token Bar */
.cd-token-bar {
  height: 8px;
  background: var(--cd-bg-primary);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  margin-bottom: 8px;
}

.cd-token-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.cd-token-fill.cd-token-input {
  background: var(--cd-accent-blue);
}

.cd-token-fill.cd-token-output {
  background: var(--cd-accent-green);
}

.cd-token-legend {
  display: flex;
  gap: 16px;
}

.cd-token-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--cd-text-secondary);
}

.cd-token-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* Events List */
.cd-events-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cd-event-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--cd-bg-tertiary);
  border-radius: 4px;
  font-size: 11px;
}

.cd-event-item.cd-event-failed {
  opacity: 0.5;
}

.cd-event-time {
  color: var(--cd-text-tertiary);
  min-width: 50px;
}

.cd-event-endpoint {
  flex: 1;
  color: var(--cd-text-primary);
}

.cd-event-cache {
  font-size: 10px;
}

.cd-event-cache.cd-cache-hit {
  color: var(--cd-accent-green);
}

.cd-event-cache.cd-cache-miss {
  color: var(--cd-text-tertiary);
}

.cd-event-latency {
  min-width: 50px;
  text-align: right;
  font-family: 'SF Mono', 'Monaco', monospace;
}
`;
