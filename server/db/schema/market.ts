import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./columns";

/** 自选标的：股票 / 指数 / 基金 */
export const marketWatch = sqliteTable(
  "market_watch",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull().default("stock"),
    /** 纯代码：600519 / 000001 / 110022 / AAPL / SPX */
    code: text("code").notNull(),
    name: text("name").notNull().default(""),
    /** 持仓成本价（可空），基金为净值 */
    cost: real("cost"),
    /** 持有份额/股数（可空） */
    shares: real("shares"),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt().notNull(),
    updatedAt: updatedAt().notNull(),
    // 下两列由 0025 迁移追加，字段顺序需与物理表一致（migrations.test 校验列顺序）。
    /** 市场：cn = 沪深/公募基金，us = 美股与美股指数 */
    market: text("market").notNull().default("cn"),
    /** 东方财富 secid：1.600519 / 0.399001 / 105.AAPL / 100.SPX；基金留空走净值接口 */
    secid: text("secid").notNull().default(""),
  },
  (t) => [uniqueIndex("uniq_market_watch").on(t.kind, t.code), index("idx_market_watch_sort").on(t.sort)],
);

/** 涨跌提醒：每个自选标的可挂多条规则，命中后走通知渠道 */
export const marketAlert = sqliteTable(
  "market_alert",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    watchId: integer("watch_id")
      .notNull()
      .references(() => marketWatch.id, { onDelete: "cascade" }),
    /** up_pct：涨幅达到阈值；down_pct：跌幅达到阈值；price_above / price_below：价格穿越 */
    rule: text("rule").notNull(),
    threshold: real("threshold").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /** 上次成功推送时间，用于单条规则冷却 */
    lastFiredAt: integer("last_fired_at", { mode: "timestamp_ms" }),
    createdAt: createdAt().notNull(),
    updatedAt: updatedAt().notNull(),
  },
  (t) => [index("idx_market_alert_watch").on(t.watchId)],
);

/** 行情快照（用于画曲线 / 历史回看），每天每个标的最多若干条 */
export const marketSnapshot = sqliteTable(
  "market_snapshot",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    code: text("code").notNull(),
    price: real("price").notNull(),
    changePct: real("change_pct").notNull().default(0),
    capturedAt: integer("captured_at").notNull(),
  },
  (t) => [index("idx_market_snapshot_code").on(t.kind, t.code, t.capturedAt)],
);
