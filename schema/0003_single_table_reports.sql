-- Migration 0003: Single Table for Trends Reports
-- Merges index and payload into one table for atomic operations
-- This replaces the separate trend_daily_index + KV payload pattern

-- Main reports table: stores both the index (day_key) and full payload
CREATE TABLE IF NOT EXISTS trend_reports (
  day_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,       -- Full TrendsReport JSON
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index for time-based queries (newest first)
CREATE INDEX IF NOT EXISTS idx_reports_created ON trend_reports(day_key DESC);

-- Optional: Index for keywords extraction (query JSON content)
-- SQLite JSON operations are slower but acceptable for this use case
