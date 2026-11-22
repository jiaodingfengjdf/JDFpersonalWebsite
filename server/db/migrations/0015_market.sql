-- 行情看板：自选标的 + 快照
CREATE TABLE "market_watch" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'stock' CHECK ("kind" IN ('stock', 'index', 'fund')),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "cost" REAL,
  "shares" REAL,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "uniq_market_watch" ON "market_watch" ("kind", "code");
CREATE INDEX "idx_market_watch_sort" ON "market_watch" ("sort");

CREATE TABLE "market_snapshot" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "price" REAL NOT NULL,
  "change_pct" REAL NOT NULL DEFAULT 0,
  "captured_at" INTEGER NOT NULL
);
CREATE INDEX "idx_market_snapshot_code" ON "market_snapshot" ("kind", "code", "captured_at");

-- 默认自选：一个指数、一只股票、一只基金
INSERT INTO "market_watch" ("kind", "code", "name", "sort", "created_at", "updated_at") VALUES
  ('index', '000001', '上证指数', 10, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('index', '399001', '深证成指', 20, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('stock', '600519', '贵州茅台', 30, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('fund', '110022', '易方达消费行业', 40, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
