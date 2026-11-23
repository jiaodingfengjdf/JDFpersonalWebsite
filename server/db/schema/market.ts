import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./columns";

/** 自选标的：股票 / 指数 / 基金 */
export const marketWatch = sqliteTable(
  "market_watch",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull().default("stock"),
    /** 纯代码：600519 / 000001 / 110022 */
    code: text("code").notNull(),
    name: text("name").notNull().default(""),
    /** 持仓成本价（可空），基金为净值 */
    cost: real("cost"),
    /** 持有份额/股数（可空） */
    shares: real("shares"),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt().notNull(),
    updatedAt: updatedAt().notNull(),
  },
  (t) => [uniqueIndex("uniq_market_watch").on(t.kind, t.code), index("idx_market_watch_sort").on(t.sort)],
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
