/**
 * System Status Component - 源健康监控面板
 *
 * 显示:
 * 1. 系统整体健康状态
 * 2. 各源的健康状态和性能指标
 * 3. 延迟和成功率监控
 * 4. 电路熔断状态
 *
 * @module components/news/SystemStatus
 */

import { useState, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export type SourceHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
export type CircuitState = 'closed' | 'open' | 'half_open';

export interface SourceHealthRecord {
  source_id: number;
  source_name: string;
  status: SourceHealthStatus;
  circuit_state: CircuitState;
  avg_latency_ms: number;
  p95_latency_ms: number;
  last_fetch_time_ms?: number;
  success_rate: number;
  consecutive_failures: number;
  consecutive_successes: number;
  last_check_at: number;
  last_success_at?: number;
  last_failure_at?: number;
  last_error?: string;
  error_count_24h: number;
  avg_items_per_fetch: number;
  last_item_count: number;
  is_active: boolean;
  category?: string;
}

export interface SystemHealthSummary {
  overall_status: 'healthy' | 'degraded' | 'down';
  total_sources: number;
  healthy_sources: number;
  degraded_sources: number;
  down_sources: number;
  by_category: Record<string, {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
  }>;
  last_check_at: number;
  next_check_at?: number;
  sources: SourceHealthRecord[];
}

export interface HealthResponse {
  success: true;
  data: SystemHealthSummary;
  timestamp: string;
}

// ============================================================================
// Configuration
// ============================================================================

const STATUS_CONFIG: Record<SourceHealthStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}> = {
  healthy: {
    label: 'Healthy',
    color: '#059669',
    bgColor: '#E8F5E9',
    icon: '✓',
  },
  degraded: {
    label: 'Degraded',
    color: '#D97706',
    bgColor: '#FEF3C7',
    icon: '⚠',
  },
  down: {
    label: 'Down',
    color: '#DC2626',
    bgColor: '#FEE2E2',
    icon: '✕',
  },
  unknown: {
    label: 'Unknown',
    color: '#6B7280',
    bgColor: '#F3F4F6',
    icon: '?',
  },
};

const CIRCUIT_CONFIG: Record<CircuitState, {
  label: string;
  color: string;
}> = {
  closed: { label: 'Active', color: '#059669' },
  open: { label: 'Tripped', color: '#DC2626' },
  half_open: { label: 'Recovering', color: '#D97706' },
};

// ============================================================================
// Helpers
// ============================================================================

function formatTimeAgo(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  const seconds = Math.floor(diff);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// ============================================================================
// Components
// ============================================================================

interface StatusIndicatorProps {
  status: SourceHealthStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function StatusIndicator({ status, size = 'md', showLabel = false }: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const sizeClass = size === 'sm' ? 'ss-indicator-sm' : size === 'lg' ? 'ss-indicator-lg' : '';

  return (
    <div className={`ss-indicator ss-indicator-${status} ${sizeClass}`}>
      <span className="ss-indicator-dot" />
      {showLabel && <span className="ss-indicator-label">{config.label}</span>}
    </div>
  );
}

interface CircuitBadgeProps {
  state: CircuitState;
}

function CircuitBadge({ state }: CircuitBadgeProps) {
  const config = CIRCUIT_CONFIG[state];
  return (
    <span
      className="ss-circuit-badge"
      style={{ backgroundColor: config.color + '20', color: config.color }}
    >
      {config.label}
    </span>
  );
}

interface SourceHealthCardProps {
  source: SourceHealthRecord;
  onClick?: () => void;
}

function SourceHealthCard({ source, onClick }: SourceHealthCardProps) {
  const statusConfig = STATUS_CONFIG[source.status];
  const isHealthy = source.status === 'healthy';

  return (
    <div
      className={`ss-source-card ${isHealthy ? 'ss-source-healthy' : 'ss-source-unhealthy'}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="ss-source-header">
        <div className="ss-source-name-row">
          <h4 className="ss-source-name">{source.source_name}</h4>
          <StatusIndicator status={source.status} size="sm" />
        </div>
        {source.category && (
          <span className="ss-source-category">{source.category}</span>
        )}
      </div>

      {/* Metrics */}
      <div className="ss-source-metrics">
        {/* Latency */}
        <div className="ss-metric">
          <span className="ss-metric-label">Latency</span>
          <span
            className="ss-metric-value"
            style={{ color: source.avg_latency_ms > 3000 ? '#D97706' : '#059669' }}
          >
            {formatLatency(source.avg_latency_ms)}
          </span>
        </div>

        {/* Success Rate */}
        <div className="ss-metric">
          <span className="ss-metric-label">Success</span>
          <span
            className="ss-metric-value"
            style={{ color: source.success_rate < 0.8 ? '#D97706' : '#059669' }}
          >
            {formatRate(source.success_rate)}
          </span>
        </div>

        {/* Items */}
        <div className="ss-metric">
          <span className="ss-metric-label">Items</span>
          <span className="ss-metric-value number">{source.last_item_count}</span>
        </div>
      </div>

      {/* Circuit State */}
      {source.circuit_state !== 'closed' && (
        <div className="ss-circuit-row">
          <CircuitBadge state={source.circuit_state} />
          {source.consecutive_failures > 0 && (
            <span className="ss-fail-count">{source.consecutive_failures} failures</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="ss-source-footer">
        <span className="ss-check-time">{formatTimeAgo(source.last_check_at)}</span>
        {source.last_error && !isHealthy && (
          <span className="ss-error" title={source.last_error}>
            {source.last_error.length > 30
              ? source.last_error.slice(0, 30) + '...'
              : source.last_error}
          </span>
        )}
      </div>
    </div>
  );
}

interface SystemSummaryCardProps {
  summary: SystemHealthSummary;
}

function SystemSummaryCard({ summary }: SystemSummaryCardProps) {
  const statusConfig = STATUS_CONFIG[summary.overall_status];
  const healthPercent = summary.total_sources > 0
    ? Math.round((summary.healthy_sources / summary.total_sources) * 100)
    : 0;

  return (
    <div className={`ss-summary-card ss-summary-${summary.overall_status}`}>
      {/* Overall Status */}
      <div className="ss-summary-header">
        <div>
          <h3 className="ss-summary-title">System Health</h3>
          <p className="ss-summary-subtitle">
            Last checked: {formatTimeAgo(summary.last_check_at)}
          </p>
        </div>
        <div className="ss-summary-status">
          <span className="ss-summary-icon">{statusConfig.icon}</span>
          <span className="ss-summary-label">{statusConfig.label}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="ss-summary-stats">
        <div className="ss-stat">
          <span className="ss-stat-label">Healthy</span>
          <span className="ss-stat-value ss-stat-healthy">
            {summary.healthy_sources}
          </span>
        </div>
        <div className="ss-stat">
          <span className="ss-stat-label">Degraded</span>
          <span className="ss-stat-value ss-stat-degraded">
            {summary.degraded_sources}
          </span>
        </div>
        <div className="ss-stat">
          <span className="ss-stat-label">Down</span>
          <span className="ss-stat-value ss-stat-down">
            {summary.down_sources}
          </span>
        </div>
        <div className="ss-stat">
          <span className="ss-stat-label">Health</span>
          <span className={`ss-stat-value ${healthPercent >= 80 ? 'ss-stat-healthy' : healthPercent >= 50 ? 'ss-stat-degraded' : 'ss-stat-down'}`}>
            {healthPercent}%
          </span>
        </div>
      </div>

      {/* Category Breakdown */}
      {Object.keys(summary.by_category).length > 0 && (
        <div className="ss-category-breakdown">
          {Object.entries(summary.by_category).map(([category, stats]) => (
            <div key={category} className="ss-category-item">
              <span className="ss-category-name">{category}</span>
              <div className="ss-category-bar">
                <div
                  className="ss-category-fill ss-category-healthy"
                  style={{ width: `${(stats.healthy / stats.total) * 100}%` }}
                />
                <div
                  className="ss-category-fill ss-category-degraded"
                  style={{ width: `${(stats.degraded / stats.total) * 100}%` }}
                />
                <div
                  className="ss-category-fill ss-category-down"
                  style={{ width: `${(stats.down / stats.total) * 100}%` }}
                />
              </div>
              <span className="ss-category-count">{stats.total}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export interface SystemStatusProps {
  apiUrl?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onSourceClick?: (source: SourceHealthRecord) => void;
  filterCategory?: string;
  compact?: boolean;
}

export function SystemStatus({
  apiUrl = '/api/news/health',
  autoRefresh = true,
  refreshInterval = 60000,
  onSourceClick,
  filterCategory,
  compact = false,
}: SystemStatusProps) {
  const [summary, setSummary] = useState<SystemHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<SourceHealthStatus | 'all'>('all');
  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  const fetchHealth = async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);

      const url = new URL(apiUrl, window.location.origin);
      if (forceRefresh) url.searchParams.set('force', 'true');
      if (filterCategory) url.searchParams.set('category', filterCategory);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: HealthResponse = await response.json();
      setSummary(data.data);
      setError(null);
    } catch (err) {
      console.error('[SystemStatus] Failed to fetch health:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();

    if (autoRefresh) {
      const interval = setInterval(() => fetchHealth(), refreshInterval);
      return () => clearInterval(interval);
    }
  }, [apiUrl, autoRefresh, refreshInterval, filterCategory]);

  const handleRefresh = () => fetchHealth(true);

  const handleSourceClick = (source: SourceHealthRecord) => {
    if (expandedSource === source.source_id) {
      setExpandedSource(null);
    } else {
      setExpandedSource(source.source_id);
    }
    onSourceClick?.(source);
  };

  const filteredSources = summary?.sources.filter(s => {
    if (selectedStatus === 'all') return true;
    return s.status === selectedStatus;
  }) ?? [];

  if (loading && !summary) {
    return (
      <div className="ss-loading">
        <div className="ss-loading-spinner" />
        <p>Loading system status...</p>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="ss-error">
        <span className="ss-error-icon">⚠</span>
        <p>{error}</p>
        <button onClick={handleRefresh} className="ss-retry-btn">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`ss-container ${compact ? 'ss-compact' : ''}`}>
      {/* Header */}
      <div className="ss-header">
        <h2 className="ss-title">System Status</h2>
        <div className="ss-actions">
          <button
            onClick={handleRefresh}
            className={`ss-refresh-btn ${refreshing ? 'ss-refreshing' : ''}`}
            disabled={refreshing}
          >
            <span className={`ss-refresh-icon ${refreshing ? 'ss-spin' : ''}`}>⟳</span>
            {refreshing ? 'Checking...' : 'Check Now'}
          </button>
        </div>
      </div>

      {/* Summary */}
      {summary && <SystemSummaryCard summary={summary} />}

      {/* Filters */}
      <div className="ss-filters">
        <button
          className={`ss-filter-btn ${selectedStatus === 'all' ? 'ss-filter-active' : ''}`}
          onClick={() => setSelectedStatus('all')}
        >
          All ({summary?.total_sources ?? 0})
        </button>
        <button
          className={`ss-filter-btn ${selectedStatus === 'healthy' ? 'ss-filter-active' : ''}`}
          onClick={() => setSelectedStatus('healthy')}
        >
          Healthy ({summary?.healthy_sources ?? 0})
        </button>
        <button
          className={`ss-filter-btn ${selectedStatus === 'degraded' ? 'ss-filter-active' : ''}`}
          onClick={() => setSelectedStatus('degraded')}
        >
          Degraded ({summary?.degraded_sources ?? 0})
        </button>
        <button
          className={`ss-filter-btn ${selectedStatus === 'down' ? 'ss-filter-active' : ''}`}
          onClick={() => setSelectedStatus('down')}
        >
          Down ({summary?.down_sources ?? 0})
        </button>
      </div>

      {/* Source List */}
      <div className="ss-source-list">
        {filteredSources.length === 0 ? (
          <div className="ss-empty">
            <p>No sources match the selected filter.</p>
          </div>
        ) : (
          filteredSources.map(source => (
            <SourceHealthCard
              key={source.source_id}
              source={source}
              onClick={() => handleSourceClick(source)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {summary && (
        <div className="ss-footer">
          <span className="ss-footer-time">
            Updated: {new Date(summary.last_check_at * 1000).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

export default SystemStatus;
