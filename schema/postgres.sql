-- Intelligence Sources Table for Vercel Postgres
-- Equivalent to the D1 intelligence_sources table

CREATE TABLE IF NOT EXISTS intelligence_sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  strategy VARCHAR(20) NOT NULL CHECK (strategy IN ('DIRECT', 'RSSHUB')),
  rsshub_path TEXT,
  category VARCHAR(100),
  weight REAL DEFAULT 1.0,
  logic_filter TEXT,
  is_active INTEGER DEFAULT 1,
  reliability_score REAL DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_scraped_at TIMESTAMP WITH TIME ZONE
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_intelligence_sources_active ON intelligence_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_intelligence_sources_strategy ON intelligence_sources(strategy);
CREATE INDEX IF NOT EXISTS idx_intelligence_sources_category ON intelligence_sources(category);
