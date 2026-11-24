-- 行情扩充：区分 A 股与美股，并保存东财 secid 作为行情/K线主键。
-- 存量记录默认 market = 'cn'，secid 留空，由服务层按代码推导。
ALTER TABLE "market_watch" ADD COLUMN "market" TEXT NOT NULL DEFAULT 'cn';
ALTER TABLE "market_watch" ADD COLUMN "secid" TEXT NOT NULL DEFAULT '';
CREATE INDEX "idx_market_watch_market" ON "market_watch" ("market");

-- 预置三个美股指数，避免用户还没添加就看不到标普/纳指/道指。
INSERT OR IGNORE INTO "market_watch" ("kind", "code", "name", "market", "secid", "sort", "created_at", "updated_at") VALUES
  ('index', 'SPX', '标普500', 'us', '100.SPX', 50, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('index', 'NDX', '纳斯达克', 'us', '100.NDX', 60, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('index', 'DJIA', '道琼斯', 'us', '100.DJIA', 70, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
