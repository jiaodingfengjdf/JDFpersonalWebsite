import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./columns";

/** 账户：现金 / 微信 / 支付宝 / 银行卡 / 基金账户… */
export const ledgerAccount = sqliteTable("ledger_account", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("cash"),
  initialBalance: real("initial_balance").notNull().default(0),
  currency: text("currency").notNull().default("CNY"),
  sort: integer("sort").notNull().default(0),
  archived: integer("archived").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 分类：餐饮/交通/工资… */
export const ledgerCategory = sqliteTable(
  "ledger_category",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("expense"),
    icon: text("icon").notNull().default(""),
    parentId: integer("parent_id"),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_ledger_category_kind").on(t.kind, t.sort)],
);

/** 流水 */
export const ledgerTxn = sqliteTable(
  "ledger_txn",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => ledgerAccount.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => ledgerCategory.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull().default("expense"),
    amount: real("amount").notNull(),
    /** 发生时间（毫秒） */
    occurredAt: integer("occurred_at").notNull(),
    merchant: text("merchant").notNull().default(""),
    note: text("note").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    /** 导入去重键（支付宝/微信账单流水号） */
    externalId: text("external_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_ledger_txn_time").on(t.occurredAt),
    index("idx_ledger_txn_category").on(t.categoryId),
    uniqueIndex("uniq_ledger_txn_external").on(t.externalId),
  ],
);

/** 月度预算（按分类） */
export const ledgerBudget = sqliteTable(
  "ledger_budget",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => ledgerCategory.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    amount: real("amount").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uniq_ledger_budget").on(t.categoryId, t.month)],
);
