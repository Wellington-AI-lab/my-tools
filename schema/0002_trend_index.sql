-- Migration 0002: Trend Daily Index Table
-- Source of truth for available trend reports
-- Migrates index from KV (non-atomic Read-Modify-Write) to D1 (atomic SQL)

CREATE TABLE IF NOT EXISTS trend_daily_index (
  day_key TEXT PRIMARY KEY, -- e.g., '2025-12-28'
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index for fast time-based retrieval (DESC for newest first)
CREATE INDEX IF NOT EXISTS idx_trend_daily_index_created ON trend_daily_index(day_key DESC);
