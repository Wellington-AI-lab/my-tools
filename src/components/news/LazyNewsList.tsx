/**
 * Lazy News List Component
 *
 * Async-First Frontend Architecture:
 * 1. Initial fetch: Fast path (< 2s) with cached enrichments
 * 2. Intersection Observer: Trigger summarize on viewport entry
 * 3. Click-to-summarize: Manual trigger fallback
 * 4. Individual loading states per item
 * 5. Request deduplication: Prevent duplicate calls
 *
 * Usage:
 *   <LazyNewsList summarizeMode="cached" />
 *   <LazyNewsList summarizeMode="off" onSummarizeClick />
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

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

export interface SummarizeResponse {
  success: boolean;
  data?: {
    url: string;
    category: ArticleCategory;
    bottom_line: string;
    signal_score: number;
    key_insights?: string[];
  };
  cached?: boolean;
  timestamp?: string;
  error?: string;
}

interface Props {
  articles: Article[];
  summarizeMode?: 'cached' | 'off';
  onSummarizeClick?: boolean;  // Require click instead of auto-trigger
  autoTrigger?: boolean;        // Trigger on viewport entry
}

// ============================================================================
// API Helper
// ============================================================================

const SUMMARIZE_CACHE = new Map<string, SummarizeResponse['data']>();
const PENDING_REQUESTS = new Map<string, Promise<SummarizeResponse['data']>>();

async function summarizeArticle(article: BaseArticle): Promise<SummarizeResponse['data']> {
  // Check memory cache
  const cached = SUMMARIZE_CACHE.get(article.url);
  if (cached) return cached;

  // Check for pending request
  const pending = PENDING_REQUESTS.get(article.url);
  if (pending) return pending;

  // Create new request
  const promise = (async () => {
    try {
      const response = await fetch('/api/news/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: article.url,
          title: article.title,
          summary: article.summary,
          source: article.source,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result: SummarizeResponse = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Summarization failed');
      }

      // Cache result
      SUMMARIZE_CACHE.set(article.url, result.data);

      return result.data;
    } finally {
      PENDING_REQUESTS.delete(article.url);
    }
  })();

  PENDING_REQUESTS.set(article.url, promise);
  return promise;
}

// ============================================================================
// Category Badge Component
// ============================================================================

const CATEGORY_CONFIG: Record<ArticleCategory, { label: string; color: string }> = {
  engineering: { label: 'Engineering', color: 'bg-blue-500/10 text-blue-400' },
  ai: { label: 'AI', color: 'bg-purple-500/10 text-purple-400' },
  business: { label: 'Business', color: 'bg-green-500/10 text-green-400' },
  product: { label: 'Product', color: 'bg-orange-500/10 text-orange-400' },
  science: { label: 'Science', color: 'bg-cyan-500/10 text-cyan-400' },
  opinion: { label: 'Opinion', color: 'bg-yellow-500/10 text-yellow-400' },
  noise: { label: 'Noise', color: 'bg-gray-500/10 text-gray-400' },
};

function CategoryBadge({ category, score }: { category: ArticleCategory; score: number }) {
  const config = CATEGORY_CONFIG[category];

  return (
    <div className="flex items-center gap-2">
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
      <span className={`text-xs font-mono ${
        score >= 7 ? 'text-green-400' : score >= 5 ? 'text-yellow-400' : 'text-gray-400'
      }`}>
        {score}/10
      </span>
    </div>
  );
}

// ============================================================================
// Article Card Component with Lazy Loading
// ============================================================================

interface ArticleCardProps {
  article: Article;
  onSummarize?: () => void;
  autoTrigger?: boolean;
}

function ArticleCard({ article, onSummarize, autoTrigger }: ArticleCardProps) {
  const [enrichment, setEnrichment] = useState<SummarizeResponse['data'] | null>(
    (article as EnrichedArticle).ai_enriched
      ? {
          url: article.url,
          category: (article as EnrichedArticle).ai_category,
          bottom_line: (article as EnrichedArticle).ai_bottom_line,
          signal_score: (article as EnrichedArticle).ai_signal_score,
          key_insights: (article as EnrichedArticle).ai_key_insights,
        }
      : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggered, setTriggered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for auto-trigger
  useEffect(() => {
    if (!autoTrigger || enrichment || triggered || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !triggered) {
          setTriggered(true);
          handleSummarize();
        }
      },
      { threshold: 0.5 }  // 50% visible
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, [autoTrigger, enrichment, triggered, loading]);

  const handleSummarize = useCallback(async () => {
    if (enrichment || loading) return;

    setLoading(true);
    setError(null);

    try {
      const result = await summarizeArticle(article as BaseArticle);
      setEnrichment(result);
      onSummarize?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to summarize');
    } finally {
      setLoading(false);
    }
  }, [article, enrichment, loading, onSummarize]);

  const isEnriched = (article as EnrichedArticle).ai_enriched;

  return (
    <div
      ref={cardRef}
      className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-lg font-medium text-white hover:text-blue-400 transition-colors line-clamp-2"
        >
          {article.title}
        </a>

        {/* Enrichment Status */}
        {isEnriched || enrichment ? (
          <CategoryBadge
            category={(enrichment || (article as EnrichedArticle)).category}
            score={(enrichment || (article as EnrichedArticle)).signal_score}
          />
        ) : loading ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400">Analyzing...</span>
          </div>
        ) : error ? (
          <button
            onClick={handleSummarize}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Retry
          </button>
        ) : autoTrigger ? (
          <div className="text-xs text-gray-500">Waiting for view...</div>
        ) : (
          <button
            onClick={handleSummarize}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          >
            Analyze
          </button>
        )}
      </div>

      {/* Source & Date */}
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
        <span>{article.source}</span>
        <span>•</span>
        <span>{new Date(article.published_at * 1000).toLocaleDateString()}</span>
      </div>

      {/* Bottom Line (when enriched) */}
      {enrichment || isEnriched ? (
        <div className="mb-3 p-3 bg-gray-900/50 rounded border-l-2 border-blue-500">
          <p className="text-sm text-gray-300">
            {(enrichment || (article as EnrichedArticle)).bottom_line}
          </p>
        </div>
      ) : null}

      {/* Summary */}
      <p className="text-sm text-gray-400 line-clamp-3">
        {article.summary}
      </p>

      {/* Key Insights (when enriched) */}
      {enrichment?.key_insights || (isEnriched && (article as EnrichedArticle).ai_key_insights) ? (
        <ul className="mt-3 space-y-1">
          {(enrichment?.key_insights || (article as EnrichedArticle).ai_key_insights || []).map((insight, i) => (
            <li key={i} className="text-xs text-gray-500 flex items-start gap-2">
              <span className="text-blue-400">•</span>
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ============================================================================
// Main List Component
// ============================================================================

export function LazyNewsList({
  articles,
  summarizeMode = 'cached',
  onSummarizeClick = false,
  autoTrigger = !onSummarizeClick,
}: Props) {
  const [enrichedCount, setEnrichedCount] = useState(
    articles.filter(a => (a as EnrichedArticle).ai_enriched).length
  );

  const handleSummarize = useCallback(() => {
    setEnrichedCount(c => c + 1);
  }, []);

  // Separate enriched and non-enriched articles for display
  const { enrichedArticles, pendingArticles } = useMemo(() => {
    const enriched: Article[] = [];
    const pending: Article[] = [];

    for (const article of articles) {
      if ((article as EnrichedArticle).ai_enriched) {
        enriched.push(article);
      } else {
        pending.push(article);
      }
    }

    return { enrichedArticles: enriched, pendingArticles: pending };
  }, [articles]);

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">
          {enrichedCount}/{articles.length} analyzed
        </span>
        {summarizeMode === 'cached' && (
          <span className="text-xs text-gray-500">
            Pre-loaded from cache • Scroll to trigger analysis
          </span>
        )}
      </div>

      {/* Article List */}
      <div className="space-y-4">
        {[...enrichedArticles, ...pendingArticles].map(article => (
          <ArticleCard
            key={article.id}
            article={article}
            onSummarize={handleSummarize}
            autoTrigger={autoTrigger}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Hook for Data Fetching
// ============================================================================

export function useNewsFeed(options: {
  summarizeMode?: 'cached' | 'off';
  source?: string;
  limit?: number;
} = {}) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.summarizeMode === 'cached') params.set('summarize', 'cached');
      if (options.source) params.set('source', options.source);
      if (options.limit) params.set('limit', String(options.limit));

      const response = await fetch(`/api/news/feed?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setArticles(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  return { articles, loading, error, refetch: fetchArticles };
}
