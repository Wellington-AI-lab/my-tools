-- Trends Scanner D1 Database Schema
-- Refactored schema with optimized indexes

-- Tag snapshots table: stores tag statistics from each scan
CREATE TABLE IF NOT EXISTS tag_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_time TEXT NOT NULL,        -- ISO 8601 timestamp
  tag TEXT NOT NULL,              -- Tag name
  count INTEGER NOT NULL,         -- Occurrence count
  rank INTEGER,                   -- Rank in this scan
  period TEXT NOT NULL DEFAULT '4h'  -- Period: 4h/day/week
);

-- News history table: stores news items for tag lookup
CREATE TABLE IF NOT EXISTS news_history (
  id TEXT PRIMARY KEY,            -- News item ID
  url TEXT NOT NULL,              -- Article URL
  title TEXT NOT NULL,            -- Article title
  tags TEXT NOT NULL,             -- JSON array of tags
  scan_time TEXT NOT NULL,        -- Scan timestamp (ISO 8601)
  source TEXT                     -- Data source identifier (e.g., 'weibo_hot', 'google_trends_rss')
);

-- Dropped tags table: tracks tags that were filtered out during normalization
-- Used for monitoring and iterative improvement of the tag taxonomy
CREATE TABLE IF NOT EXISTS dropped_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_tag TEXT NOT NULL,     -- The original tag as returned by AI
  normalized_tag TEXT NOT NULL,   -- The normalized version (before rejection)
  reason TEXT NOT NULL,           -- Reason for dropping: NOT_IN_WHITELIST, EMPTY, DUPLICATE
  created_at TEXT NOT NULL,       -- Timestamp (ISO 8601)
  scan_id TEXT                    -- Optional: link to specific scan for correlation
);

-- Model fusion stats table: tracks model agreement metrics
CREATE TABLE IF NOT EXISTS model_fusion_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_time TEXT NOT NULL,        -- ISO 8601 timestamp
  model_a_name TEXT NOT NULL,     -- Model A identifier (e.g., 'cloudflare-ai')
  model_b_name TEXT NOT NULL,     -- Model B identifier (e.g., 'glm-4')
  total_input INTEGER NOT NULL,   -- Total tags input from both models
  total_output INTEGER NOT NULL,  -- Final tags after fusion
  intersection_count INTEGER NOT NULL,  -- Tags agreed by both models
  dropped_count INTEGER NOT NULL,       -- Tags that were dropped
  created_at TEXT NOT NULL        -- Timestamp (ISO 8601)
);

-- Optimized indexes for tag_snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_time ON tag_snapshots(scan_time);
CREATE INDEX IF NOT EXISTS idx_snapshots_tag ON tag_snapshots(tag);
CREATE INDEX IF NOT EXISTS idx_snapshots_tag_time ON tag_snapshots(tag, scan_time);
CREATE INDEX IF NOT EXISTS idx_snapshots_period ON tag_snapshots(period, scan_time);

-- Indexes for news_history
CREATE INDEX IF NOT EXISTS idx_news_time ON news_history(scan_time);
CREATE INDEX IF NOT EXISTS idx_news_tags ON news_history(tags);
CREATE INDEX IF NOT EXISTS idx_news_source ON news_history(source);
CREATE INDEX IF NOT EXISTS idx_news_source_time ON news_history(source, scan_time);

-- Indexes for dropped_tags
CREATE INDEX IF NOT EXISTS idx_dropped_tags_created ON dropped_tags(created_at);
CREATE INDEX IF NOT EXISTS idx_dropped_tags_reason ON dropped_tags(reason);
CREATE INDEX IF NOT EXISTS idx_dropped_tags_original ON dropped_tags(original_tag);

-- Indexes for model_fusion_stats
CREATE INDEX IF NOT EXISTS idx_fusion_stats_time ON model_fusion_stats(scan_time);
CREATE INDEX IF NOT EXISTS idx_fusion_stats_models ON model_fusion_stats(model_a_name, model_b_name);
