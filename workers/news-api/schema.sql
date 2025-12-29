-- 新闻聚合数据库表结构
-- 创建时间: 2025-12-28

-- 文章表
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    source TEXT NOT NULL,
    summary TEXT,
    created_at INTEGER NOT NULL,
    external_id TEXT NOT NULL UNIQUE
);

-- 创建索引，提高查询性能
CREATE INDEX IF NOT EXISTS idx_created_at ON articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source ON articles(source);
