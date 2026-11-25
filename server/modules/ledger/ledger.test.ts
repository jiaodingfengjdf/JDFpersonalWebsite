import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { parseLedgerDate } from "@/lib/ledger-date";
import { runMigrations } from "@/server/db/migrate";
import { openDatabase } from "@/server/db/open";
import * as schema from "@/server/db/schema";
import { createLedgerService } from "./service";

describe("ledger service", () => {
  it("updates by id with joined names, and backdated creates keep their names", async () => {
    const connection = openDatabase(":memory:");
    try {
      runMigrations(connection);
      const ledger = createLedgerService(drizzle(connection, { schema }));
      const account = await ledger.createAccount({
        name: "补记账户", kind: "cash", initial_balance: 0, currency: "CNY", sort: 0,
      });
      const category = (await ledger.categories()).find((item) => item.name === "餐饮")!;

      const created = await ledger.createTransaction({
        account_id: account.id, category_id: category.id, kind: "expense", amount: 10,
        occurred_at: parseLedgerDate("2026-01-02"), merchant: "旧商家", note: "旧备注", tags: [],
      });
      expect(created).toMatchObject({
        account_name: "补记账户", category_name: "餐饮", merchant: "旧商家", note: "旧备注",
      });

      const updated = await ledger.updateTransaction(created.id, {
        account_id: account.id, category_id: null, kind: "income", amount: 20.5,
        occurred_at: parseLedgerDate("2026-01-03"), merchant: "新商家", note: "新备注", tags: [],
      });
      expect(updated).toMatchObject({
        id: created.id, account_name: "补记账户", category_name: "", kind: "income",
        amount: 20.5, merchant: "新商家", note: "新备注",
        occurred_at: parseLedgerDate("2026-01-03"),
      });
      await expect(
        ledger.updateTransaction(999_999, {
          account_id: account.id, category_id: null, kind: "income", amount: 1,
          occurred_at: parseLedgerDate("2026-01-03"), merchant: "", note: "", tags: [],
        }),
      ).rejects.toThrow("流水不存在");
    } finally {
      connection.close();
    }
  });

  it("exposes currency/archived, filters archived by default and updates accounts", async () => {
    const connection = openDatabase(":memory:");
    try {
      runMigrations(connection);
      const db = drizzle(connection, { schema });
      const ledger = createLedgerService(db);
      const account = await ledger.createAccount({
        name: "测试美元账户", kind: "bank", initial_balance: 123.45, currency: "USD", sort: 5,
      });
      expect(account).toMatchObject({ currency: "USD", archived: 0, balance: 123.45 });

      await db
        .update(schema.ledgerAccount)
        .set({ archived: 1 })
        .where(eq(schema.ledgerAccount.id, account.id));
      expect((await ledger.accounts()).some((item) => item.id === account.id)).toBe(false);
      expect(
        (await ledger.accounts({ includeArchived: true })).find((item) => item.id === account.id),
      ).toMatchObject({ currency: "USD", archived: 1 });

      const updated = await ledger.updateAccount(account.id, {
        name: "改名账户", kind: "cash", initial_balance: 500, currency: "CNY", sort: 7,
      });
      expect(updated).toMatchObject({
        name: "改名账户", kind: "cash", initial_balance: 500, currency: "CNY",
        balance: 500, archived: 1, sort: 7,
      });
      await expect(
        ledger.updateAccount(999_999, {
          name: "不存在", kind: "cash", initial_balance: 0, currency: "CNY", sort: 0,
        }),
      ).rejects.toThrow("账户不存在");
    } finally {
      connection.close();
    }
  });

  it("rejects invalid account/category refs with a validation error", async () => {
    const connection = openDatabase(":memory:");
    try {
      runMigrations(connection);
      const ledger = createLedgerService(drizzle(connection, { schema }));
      const account = await ledger.createAccount({
        name: "校验账户", kind: "cash", initial_balance: 0, currency: "CNY", sort: 0,
      });
      const created = await ledger.createTransaction({
        account_id: account.id, category_id: null, kind: "expense", amount: 1,
        occurred_at: parseLedgerDate("2026-01-02"), merchant: "", note: "", tags: [],
      });
      await expect(
        ledger.updateTransaction(created.id, {
          account_id: 999_999, category_id: null, kind: "expense", amount: 2,
          occurred_at: parseLedgerDate("2026-01-02"), merchant: "", note: "", tags: [],
        }),
      ).rejects.toThrow("账户不存在");
    } finally {
      connection.close();
    }
  });
});
