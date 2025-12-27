-- 标签快照表：每次扫描的标签统计
CREATE TABLE IF NOT EXISTS tag_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_time TEXT NOT NULL,        -- 扫描时间 ISO 8601
  tag TEXT NOT NULL,              -- 标签名
  count INTEGER NOT NULL,         -- 出现次数
  rank INTEGER,                   -- 当次排名
  period TEXT NOT NULL DEFAULT '4h'  -- 周期: 4h/day/week
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_snapshots_time ON tag_snapshots(scan_time);
CREATE INDEX IF NOT EXISTS idx_snapshots_tag ON tag_snapshots(tag);
CREATE INDEX IF NOT EXISTS idx_snapshots_tag_time ON tag_snapshots(tag, scan_time);
CREATE INDEX IF NOT EXISTS idx_snapshots_period ON tag_snapshots(period, scan_time);
