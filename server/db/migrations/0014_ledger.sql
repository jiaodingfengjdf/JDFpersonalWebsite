-- 记账本：账户 / 分类 / 流水 / 月度预算
CREATE TABLE "ledger_account" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'cash',
  "initial_balance" REAL NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "sort" INTEGER NOT NULL DEFAULT 0,
  "archived" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "ledger_category" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'expense' CHECK ("kind" IN ('income', 'expense')),
  "icon" TEXT NOT NULL DEFAULT '',
  "parent_id" INTEGER,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "idx_ledger_category_kind" ON "ledger_category" ("kind", "sort");

CREATE TABLE "ledger_txn" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "account_id" INTEGER NOT NULL REFERENCES "ledger_account" ("id") ON DELETE CASCADE,
  "category_id" INTEGER REFERENCES "ledger_category" ("id") ON DELETE SET NULL,
  "kind" TEXT NOT NULL DEFAULT 'expense' CHECK ("kind" IN ('income', 'expense')),
  "amount" REAL NOT NULL CHECK ("amount" > 0),
  "occurred_at" INTEGER NOT NULL,
  "merchant" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "tags" TEXT NOT NULL DEFAULT '[]',
  "external_id" TEXT,
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "idx_ledger_txn_time" ON "ledger_txn" ("occurred_at");
CREATE INDEX "idx_ledger_txn_category" ON "ledger_txn" ("category_id");
CREATE UNIQUE INDEX "uniq_ledger_txn_external" ON "ledger_txn" ("external_id");

CREATE TABLE "ledger_budget" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "category_id" INTEGER NOT NULL REFERENCES "ledger_category" ("id") ON DELETE CASCADE,
  "month" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "uniq_ledger_budget" ON "ledger_budget" ("category_id", "month");

-- 默认账户
INSERT INTO "ledger_account" ("name", "kind", "sort", "created_at", "updated_at") VALUES
  ('现金', 'cash', 10, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('微信', 'wechat', 20, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('支付宝', 'alipay', 30, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('银行卡', 'bank', 40, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);

-- 默认分类
INSERT INTO "ledger_category" ("name", "kind", "sort", "created_at", "updated_at") VALUES
  ('餐饮', 'expense', 10, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('交通', 'expense', 20, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('购物', 'expense', 30, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('居住', 'expense', 40, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('娱乐', 'expense', 50, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('医疗', 'expense', 60, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('学习', 'expense', 70, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('人情', 'expense', 80, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('其他支出', 'expense', 90, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('工资', 'income', 10, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('奖金', 'income', 20, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('理财收益', 'income', 30, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('其他收入', 'income', 90, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
