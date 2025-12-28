-- Migration 0004: Add source field to news_history
-- Enables tracking which data source each news item came from
-- Useful for statistical analysis by source

-- Add source column to news_history
ALTER TABLE news_history ADD COLUMN source TEXT;

-- Create index for source-based queries
CREATE INDEX IF NOT EXISTS idx_news_source ON news_history(source);
CREATE INDEX IF NOT EXISTS idx_news_source_time ON news_history(source, scan_time);
