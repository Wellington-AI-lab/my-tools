/**
 * Intelligence Dashboard - High-Density News Interface
 *
 * Design Principles:
 * 1. Tufte Density: Maximize information per pixel, minimize whitespace
 * 2. Signal-First: Sort and highlight by AI signal score
 * 3. Progressive Disclosure: Compact by default, expand on hover
 * 4. Neutral Aesthetic: Technical, minimalist, professional
 *
 * @module components/news/IntelligenceDashboard
 */

import { useState, useEffect, useMemo, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ArticleCategory =
  | 'engineering' | 'ai' | 'business' | 'product'
  | 'science' | 'opinion' | 'noise';

export interface BaseArticle {
  id: string;
  url: string;
  title: string;
  summary: string;
  source: string;
  published_at: number;
}

export interface EnrichedArticle extends BaseArticle {
  ai_enriched: true;
  ai_category: ArticleCategory;
  ai_bottom_line: string;
  ai_signal_score: number;
  ai_key_insights?: string[];
}

export type Article = BaseArticle | EnrichedArticle;

export interface DashboardResponse {
  success: boolean;
  data: Article[];
  by_source?: Array<{ source: string; count: number }>;
  ai_enriched?: boolean;
  llm_configured?: boolean;
  timestamp?: string;
}

interface DailyBriefing {
  summary: string;
  top_signals: Array<{
    title: string;
    score: number;
    category: ArticleCategory;
  }>;
  generated_at: string;
}

// ============================================================================
// Configuration
// ============================================================================

const CATEGORY_CONFIG: Record<ArticleCategory, {
  label: string;
  labelShort: string;
  color: string;
}> = {
  engineering: { label: 'Engineering', labelShort: 'ENG', color: '#3b82f6' },
  ai: { label: 'AI', labelShort: 'AI', color: '#a855f7' },
  business: { label: 'Business', labelShort: 'BIZ', color: '#22c55e' },
  product: { label: 'Product', labelShort: 'PRD', color: '#f97316' },
  science: { label: 'Science', labelShort: 'SCI', color: '#06b6d4' },
  opinion: { label: 'Opinion', labelShort: 'OPN', color: '#eab308' },
  noise: { label: 'Noise', labelShort: '─', color: '#6b7280' },
};

const SIGNAL_THRESHOLDS = [
  { value: 0, label: '全部' },
  { value: 5, label: '5+' },
  { value: 7, label: '7+' },
  { value: 8, label: '8+' },
  { value: 9, label: '9+' },
];

// ============================================================================
// Helpers
// ============================================================================

function isEnriched(article: Article): article is EnrichedArticle {
  return 'ai_enriched' in article && article.ai_enriched === true;
}

function getSignalScore(article: Article): number {
  return isEnriched(article) ? article.ai_signal_score : 0;
}

function getCategory(article: Article): ArticleCategory {
  return isEnriched(article) ? article.ai_category : 'noise';
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60);
  const hours = Math.floor(diff / 3600);
  const days = Math.floor(diff / 86400);

  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getSignalColor(score: number): string {
  if (score >= 9) return '#22c55e';      // green - paradigm shift
  if (score >= 7) return '#3b82f6';      // blue - significant
  if (score >= 5) return '#f59e0b';      // amber - useful
  return '#6b7280';                      // gray - low signal
}

function getSignalBorderColor(score: number): string {
  if (score >= 9) return 'rgba(34, 197, 94, 0.6)';
  if (score >= 7) return 'rgba(59, 130, 246, 0.6)';
  if (score >= 5) return 'rgba(245, 158, 11, 0.5)';
  return 'rgba(107, 114, 128, 0.3)';
}

// ============================================================================
// Components
// ============================================================================

/**
 * Daily Briefing Component - TL;DR Summary
 */
interface DailyBriefingProps {
  briefing: DailyBriefing | null;
  loading: boolean;
  error: string | null;
}

function DailyBriefing({ briefing, loading, error }: DailyBriefingProps) {
  if (loading) {
    return (
      <div className="id-briefing id-briefing-loading">
        <div className="id-briefing-header">
          <h2 className="id-briefing-title">TL;DR ─ 每日简报</h2>
          <div className="id-briefing-loading-spinner" />
        </div>
        <div className="id-briefing-skeleton">
          <div className="id-skeleton-line" />
          <div className="id-skeleton-line" />
          <div className="id-skeleton-line short" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="id-briefing id-briefing-error">
        <div className="id-briefing-header">
          <h2 className="id-briefing-title">TL;DR ─ 每日简报</h2>
          <span className="id-briefing-error-text">{error}</span>
        </div>
      </div>
    );
  }

  if (!briefing) {
    return null;
  }

  return (
    <div className="id-briefing">
      <div className="id-briefing-header">
        <h2 className="id-briefing-title">TL;DR ─ 每日简报</h2>
        <span className="id-briefing-meta">
          {briefing.top_signals.length} 条高信号
        </span>
      </div>
      <div className="id-briefing-summary">
        {briefing.summary.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}

/**
 * Signal Filter Slider
 */
interface SignalFilterProps {
  value: number;
  onChange: (value: number) => void;
  count: number;
  total: number;
}

function SignalFilter({ value, onChange, count, total }: SignalFilterProps) {
  return (
    <div className="id-filter-row">
      <div className="id-filter-label">
        <span>信号筛选</span>
        <span className="id-filter-count">{count}/{total}</span>
      </div>
      <div className="id-filter-controls">
        <input
          type="range"
          min="0"
          max="10"
          step="1"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="id-filter-slider"
        />
        <div className="id-filter-presets">
          {SIGNAL_THRESHOLDS.map(({ value: v, label }) => (
            <button
              key={v}
              className={`id-filter-preset ${value === v ? 'active' : ''}`}
              onClick={() => onChange(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Category Filter Pills
 */
interface CategoryFilterProps {
  value: ArticleCategory | 'all';
  onChange: (value: ArticleCategory | 'all') => void;
  counts: Record<string, number>;
}

function CategoryFilter({ value, onChange, counts }: CategoryFilterProps) {
  const categories: Array<{ key: ArticleCategory | 'all'; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'ai', label: 'AI' },
    { key: 'engineering', label: '工程' },
    { key: 'business', label: '商业' },
    { key: 'product', label: '产品' },
    { key: 'science', label: '科学' },
    { key: 'opinion', label: '观点' },
  ];

  return (
    <div className="id-category-row">
      {categories.map(({ key, label }) => {
        const count = counts[key] || 0;
        return (
          <button
            key={key}
            className={`id-category-pill ${value === key ? 'active' : ''} ${count === 0 ? 'empty' : ''}`}
            onClick={() => onChange(key)}
            disabled={count === 0 && key !== 'all'}
          >
            <span>{label}</span>
            {count > 0 && <span className="id-category-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact Article Row (High-Density)
 */
interface ArticleRowProps {
  article: Article;
  rank: number;
}

function ArticleRow({ article, rank }: ArticleRowProps) {
  const enriched = isEnriched(article);
  const score = getSignalScore(article);
  const category = getCategory(article);
  const categoryConfig = CATEGORY_CONFIG[category];
  const signalColor = getSignalColor(score);
  const borderColor = getSignalBorderColor(score);

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="id-article-row"
      style={{ borderLeftColor: borderColor }}
      data-score={score}
    >
      {/* Rank/Score Badge */}
      <div className="id-article-badge" style={{ color: signalColor }}>
        {enriched ? score.toFixed(1) : '─'}
      </div>

      {/* Main Content */}
      <div className="id-article-content">
        <div className="id-article-header">
          <h3 className="id-article-title">{article.title}</h3>

          {/* Metadata Pills */}
          <div className="id-article-meta">
            <span className="id-meta-category" style={{ color: categoryConfig.color }}>
              {categoryConfig.labelShort}
            </span>
            <span className="id-meta-source">{article.source}</span>
            <span className="id-meta-time">{formatTimeAgo(article.published_at)}</span>
          </div>
        </div>

        {/* Expandable Details */}
        <div className="id-article-details">
          {enriched ? (
            <>
              <div className="id-article-bottom-line">
                <span className="id-bottom-line-icon">→</span>
                {article.ai_bottom_line}
              </div>
              {article.ai_key_insights && article.ai_key_insights.length > 0 && (
                <ul className="id-article-insights">
                  {article.ai_key_insights.map((insight, i) => (
                    <li key={i}>{insight}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="id-article-summary">{article.summary.slice(0, 200)}...</p>
          )}
        </div>
      </div>
    </a>
  );
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

interface IntelligenceDashboardProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function IntelligenceDashboard({
  autoRefresh = true,
  refreshInterval = 5 * 60 * 1000, // 5 minutes
}: IntelligenceDashboardProps) {
  // State
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Filters
  const [minSignal, setMinSignal] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<ArticleCategory | 'all'>('all');

  // Daily Briefing
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('summarize', 'cached');
      params.set('limit', '100');

      const response = await fetch(`/api/news/feed?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: DashboardResponse = await response.json();
      if (!data.success) throw new Error('Failed to fetch');

      setArticles(data.data || []);
      setLastUpdate(new Date());

      // Generate daily briefing from high-signal articles
      const enriched = (data.data || []).filter(isEnriched);
      const topSignals = enriched
        .sort((a, b) => b.ai_signal_score - a.ai_signal_score)
        .slice(0, 5);

      if (topSignals.length > 0) {
        setBriefing({
          summary: topSignals
            .map(a => `• ${a.ai_bottom_line}`)
            .join('\n'),
          top_signals: topSignals.map(a => ({
            title: a.title,
            score: a.ai_signal_score,
            category: a.ai_category,
          })),
          generated_at: new Date().toISOString(),
        });
      }

      setBriefingLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setBriefingError('Failed to load briefing');
    } finally {
      setLoading(false);
      setBriefingLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchData]);

  // Filtered and sorted articles
  const filteredArticles = useMemo(() => {
    let result = articles.filter(isEnriched); // Only show enriched articles

    // Apply signal filter
    if (minSignal > 0) {
      result = result.filter(a => a.ai_signal_score >= minSignal);
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      result = result.filter(a => a.ai_category === categoryFilter);
    }

    // Sort by signal score (descending)
    result.sort((a, b) => b.ai_signal_score - a.ai_signal_score);

    return result;
  }, [articles, minSignal, categoryFilter]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const article of articles.filter(isEnriched)) {
      const cat = article.ai_category;
      counts[cat] = (counts[cat] || 0) + 1;
    }
    counts.all = articles.filter(isEnriched).length;
    return counts;
  }, [articles]);

  return (
    <div className="id-dashboard">
      {/* Daily Briefing */}
      <DailyBriefing
        briefing={briefing}
        loading={briefingLoading}
        error={briefingError}
      />

      {/* Filters */}
      <div className="id-filters">
        <SignalFilter
          value={minSignal}
          onChange={setMinSignal}
          count={filteredArticles.length}
          total={articles.filter(isEnriched).length}
        />
        <CategoryFilter
          value={categoryFilter}
          onChange={setCategoryFilter}
          counts={categoryCounts}
        />
      </div>

      {/* Articles List */}
      <div className="id-articles">
        {loading ? (
          <div className="id-loading">加载中...</div>
        ) : error ? (
          <div className="id-error">{error}</div>
        ) : filteredArticles.length === 0 ? (
          <div className="id-empty">暂无符合条件的文章</div>
        ) : (
          filteredArticles.map((article, index) => (
            <ArticleRow
              key={article.id}
              article={article}
              rank={index + 1}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="id-footer">
        <span>
          显示 {filteredArticles.length} / {articles.filter(isEnriched).length} 条已分析文章
        </span>
        {lastUpdate && (
          <span>
            更新于 {lastUpdate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Styles (CSS-in-JS for portability)
// ============================================================================

export const dashboardStyles = `
.id-dashboard {
  --id-bg-primary: #0a0a0a;
  --id-bg-secondary: #111111;
  --id-bg-tertiary: #1a1a1a;
  --id-border: #222222;
  --id-text-primary: #e5e5e5;
  --id-text-secondary: #888888;
  --id-text-tertiary: #444444;
  --id-accent-blue: #3b82f6;
  --id-accent-green: #22c55e;
  --id-accent-amber: #f59e0b;

  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--id-text-primary);
}

/* Daily Briefing */
.id-briefing {
  background: var(--id-bg-secondary);
  border: 1px solid var(--id-border);
  border-radius: 6px;
  padding: 12px 16px;
}

.id-briefing-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.id-briefing-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--id-text-secondary);
}

.id-briefing-meta {
  font-size: 10px;
  color: var(--id-text-tertiary);
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}

.id-briefing-summary {
  font-size: 13px;
  line-height: 1.6;
  color: var(--id-text-primary);
}

.id-briefing-summary p {
  margin: 2px 0;
}

/* Loading Skeleton */
.id-briefing-loading .id-briefing-loading-spinner {
  width: 12px;
  height: 12px;
  border: 1px solid var(--id-text-tertiary);
  border-top-color: var(--id-text-secondary);
  border-radius: 50%;
  animation: id-spin 1s linear infinite;
}

@keyframes id-spin {
  to { transform: rotate(360deg); }
}

.id-briefing-skeleton {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.id-skeleton-line {
  height: 12px;
  background: var(--id-bg-tertiary);
  border-radius: 2px;
  animation: id-pulse 1.5s ease-in-out infinite;
}

.id-skeleton-line.short {
  width: 60%;
}

@keyframes id-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}

/* Filters */
.id-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--id-bg-secondary);
  border: 1px solid var(--id-border);
  border-radius: 6px;
}

.id-filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.id-filter-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  color: var(--id-text-secondary);
  white-space: nowrap;
}

.id-filter-count {
  font-family: 'SF Mono', 'Monaco', monospace;
  color: var(--id-text-tertiary);
}

.id-filter-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.id-filter-slider {
  flex: 1;
  height: 3px;
  background: var(--id-bg-tertiary);
  border-radius: 2px;
  appearance: none;
  outline: none;
}

.id-filter-slider::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  background: var(--id-text-primary);
  border-radius: 50%;
  cursor: pointer;
}

.id-filter-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: var(--id-text-primary);
  border-radius: 50%;
  border: none;
  cursor: pointer;
}

.id-filter-presets {
  display: flex;
  gap: 4px;
}

.id-filter-preset {
  padding: 2px 6px;
  font-size: 10px;
  font-family: 'SF Mono', 'Monaco', monospace;
  background: transparent;
  border: 1px solid var(--id-border);
  border-radius: 3px;
  color: var(--id-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.id-filter-preset:hover {
  border-color: var(--id-text-tertiary);
  color: var(--id-text-primary);
}

.id-filter-preset.active {
  background: var(--id-bg-tertiary);
  border-color: var(--id-text-secondary);
  color: var(--id-text-primary);
}

/* Category Filter */
.id-category-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.id-category-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  background: transparent;
  border: 1px solid var(--id-border);
  border-radius: 4px;
  color: var(--id-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.id-category-pill:hover:not(.empty) {
  border-color: var(--id-text-tertiary);
  color: var(--id-text-primary);
}

.id-category-pill.active:not(.empty) {
  background: var(--id-bg-tertiary);
  border-color: var(--id-accent-blue);
  color: var(--id-text-primary);
}

.id-category-pill.empty {
  opacity: 0.3;
  cursor: not-allowed;
}

.id-category-count {
  font-size: 9px;
  font-family: 'SF Mono', 'Monaco', monospace;
  color: var(--id-text-tertiary);
}

.id-category-pill.active .id-category-count {
  color: var(--id-accent-blue);
}

/* Articles List */
.id-articles {
  display: flex;
  flex-direction: column;
}

.id-loading,
.id-error,
.id-empty {
  padding: 40px;
  text-align: center;
  color: var(--id-text-secondary);
}

/* Article Row */
.id-article-row {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  background: transparent;
  border-left: 3px solid transparent;
  border-bottom: 1px solid var(--id-border);
  text-decoration: none;
  transition: background 0.1s;
}

.id-article-row:hover {
  background: var(--id-bg-secondary);
}

.id-article-row:hover .id-article-details {
  display: block;
}

.id-article-badge {
  flex-shrink: 0;
  width: 32px;
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  line-height: 1.8;
}

.id-article-content {
  flex: 1;
  min-width: 0;
}

.id-article-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.id-article-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--id-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.id-article-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--id-text-tertiary);
}

.id-meta-category {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.id-meta-source {
  color: var(--id-text-tertiary);
}

.id-meta-time {
  font-family: 'SF Mono', 'Monaco', monospace;
  color: var(--id-text-tertiary);
}

/* Expandable Details */
.id-article-details {
  display: none;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--id-border);
}

.id-article-bottom-line {
  font-size: 12px;
  color: var(--id-text-secondary);
  display: flex;
  gap: 6px;
  line-height: 1.5;
}

.id-bottom-line-icon {
  color: var(--id-accent-blue);
  flex-shrink: 0;
}

.id-article-summary {
  font-size: 12px;
  color: var(--id-text-secondary);
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.id-article-insights {
  margin: 6px 0 0 0;
  padding-left: 14px;
  list-style: none;
}

.id-article-insights li {
  font-size: 11px;
  color: var(--id-text-tertiary);
  line-height: 1.4;
  margin: 2px 0;
  position: relative;
}

.id-article-insights li::before {
  content: '•';
  position: absolute;
  left: -10px;
  color: var(--id-accent-blue);
}

/* Footer */
.id-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: 10px;
  color: var(--id-text-tertiary);
  background: var(--id-bg-secondary);
  border-radius: 4px;
}
`;

// Export a hook for convenience
export function useIntelligenceDashboard() {
  return { IntelligenceDashboard, dashboardStyles };
}
