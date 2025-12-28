import { Newspaper, Globe, Clock, Sparkles, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useMemo } from 'react';
import type { TrendCard } from '@/modules/trends/types';

interface SignalItem {
  id: string;
  title: string;
  url?: string;
  source: string;
  language: 'zh' | 'en' | 'unknown';
  score: number;
  themes: string[];
  authenticity: 'real' | 'marketing' | 'unknown';
  publishedAt?: string;
  isNew?: boolean;
}

interface SignalFeedProps {
  signals?: SignalItem[];
  cards?: TrendCard[];
  maxItems?: number;
  className?: string;
}

const AUTHENTICITY_CONFIG = {
  real: { label: 'REAL', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  marketing: { label: 'AD', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  unknown: { label: '??', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

const SOURCE_ICONS: Record<string, string> = {
  google_trends_rss: '🔍',
  weibo_hot: '🔥',
  mock: '🧪',
};

const LANGUAGE_LABELS = {
  zh: 'ZH',
  en: 'EN',
  unknown: '??',
};

export function SignalFeed({ signals = [], cards = [], maxItems = 20, className }: SignalFeedProps) {
  const feedItems = useMemo(() => {
    // Convert cards to signal items if signals not provided
    if (signals.length === 0 && cards.length > 0) {
      return cards.slice(0, maxItems).map((card, idx) => ({
        id: card.id,
        title: card.title,
        url: card.url,
        source: card.source,
        language: card.language,
        score: card.signals.score,
        themes: card.themes,
        authenticity: card.themes.includes('entertainment') ? 'marketing' : 'real' as const,
        isNew: idx < 3,
      }));
    }

    return signals.slice(0, maxItems);
  }, [signals, cards, maxItems]);

  const authenticityCounts = useMemo(() => {
    const counts = { real: 0, marketing: 0, unknown: 0 };
    feedItems.forEach(item => {
      counts[item.authenticity]++;
    });
    return counts;
  }, [feedItems]);

  const getAuthenticity = (item: SignalItem): 'real' | 'marketing' | 'unknown' => {
    // Simple heuristic: entertainment/fashion themes often indicate marketing
    if (item.themes.includes('entertainment') || item.themes.includes('fashion')) {
      return 'marketing';
    }
    // High score news items are likely real signals
    if (item.score > 700) {
      return 'real';
    }
    return 'unknown';
  };

  if (feedItems.length === 0) {
    return (
      <div className={clsx("bg-gray-900/50 border border-gray-800 rounded-lg p-4", className)}>
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm font-mono">
          [NO SIGNALS] Waiting for data feed...
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Newspaper className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-mono text-gray-400">SIGNAL_FEED</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded font-mono">
            REAL: {authenticityCounts.real}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded font-mono">
            AD: {authenticityCounts.marketing}
          </span>
        </div>
      </div>

      {/* Feed */}
      <div className="divide-y divide-gray-800/50 max-h-[500px] overflow-y-auto custom-scrollbar">
        {feedItems.map((item, idx) => {
          const auth = getAuthenticity(item);
          const config = AUTHENTICITY_CONFIG[auth];
          const sourceIcon = SOURCE_ICONS[item.source] || '📡';

          return (
            <div
              key={item.id}
              className={clsx(
                "px-4 py-2 hover:bg-gray-800/30 transition-colors",
                item.isNew && "bg-blue-500/5"
              )}
            >
              <div className="flex items-start gap-2">
                {/* Source Icon */}
                <span className="text-xs mt-0.5 flex-shrink-0">{sourceIcon}</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-200 hover:text-blue-400 transition-colors line-clamp-1 font-medium"
                    >
                      {item.title}
                    </a>
                    {item.isNew && (
                      <span className="text-[9px] px-1 py-0.5 bg-blue-500/20 text-blue-400 rounded font-mono">
                        NEW
                      </span>
                    )}
                  </div>

                  {/* Meta Bar */}
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    {/* Authenticity Badge */}
                    <span className={clsx(
                      "px-1 py-0.5 border rounded",
                      config.color
                    )}>
                      {config.label}
                    </span>

                    {/* Score */}
                    <span className={clsx(
                      "text-gray-500",
                      item.score > 700 && "text-green-400"
                    )}>
                      {item.score}
                    </span>

                    {/* Language */}
                    <span className="text-gray-600">
                      {LANGUAGE_LABELS[item.language]}
                    </span>

                    {/* Source */}
                    <span className="text-gray-600">
                      {item.source}
                    </span>
                  </div>

                  {/* Themes */}
                  {item.themes && item.themes.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {item.themes.slice(0, 3).map(theme => (
                        <span
                          key={theme}
                          className="text-[9px] px-1 py-0.5 bg-gray-800 text-gray-400 rounded font-mono"
                        >
                          {theme.slice(0, 3).toUpperCase()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rank Indicator */}
                <div className="flex-shrink-0">
                  <span className={clsx(
                    "text-[10px] font-mono w-5 h-5 flex items-center justify-center rounded",
                    idx < 3 ? "bg-blue-500/20 text-blue-400" : "bg-gray-800 text-gray-500"
                  )}>
                    {idx + 1}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/30">
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-500">
          <span>{feedItems.length} SIGNALS PROCESSED</span>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>LIVE FEED</span>
          </div>
        </div>
      </div>
    </div>
  );
}
