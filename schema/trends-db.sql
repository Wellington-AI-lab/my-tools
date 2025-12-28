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
  scan_time TEXT NOT NULL         -- Scan timestamp
);

-- Optimized indexes for tag_snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_time ON tag_snapshots(scan_time);
CREATE INDEX IF NOT EXISTS idx_snapshots_tag ON tag_snapshots(tag);
CREATE INDEX IF NOT EXISTS idx_snapshots_tag_time ON tag_snapshots(tag, scan_time);
CREATE INDEX IF NOT EXISTS idx_snapshots_period ON tag_snapshots(period, scan_time);

-- Indexes for news_history
CREATE INDEX IF NOT EXISTS idx_news_time ON news_history(scan_time);
CREATE INDEX IF NOT EXISTS idx_news_tags ON news_history(tags);
