-- 行情涨跌提醒：自选标的上的规则，由通知调度器定期评估。
CREATE TABLE "market_alert" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "watch_id" INTEGER NOT NULL REFERENCES "market_watch"("id") ON DELETE CASCADE,
  "rule" TEXT NOT NULL CHECK ("rule" IN ('up_pct', 'down_pct', 'price_above', 'price_below')),
  "threshold" REAL NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "last_fired_at" INTEGER,
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "idx_market_alert_watch" ON "market_alert" ("watch_id");
