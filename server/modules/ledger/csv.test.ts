import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import { parseLedgerDate } from "@/lib/ledger-date";
import { openDatabase } from "@/server/db/open";
import { runMigrations } from "@/server/db/migrate";
import * as schema from "@/server/db/schema";
import { exportLedgerCsv, parseLedgerCsv } from "./csv";
import { createLedgerService, monthRange } from "./service";

describe("ledger CSV", () => {
  it("imports quoted text and rolls back an invalid batch before any rows are committed", async () => {
    const connection = openDatabase(":memory:");
    try {
      runMigrations(connection);
      const db = drizzle(connection, { schema });
      const ledger = createLedgerService(db);
      const account = await ledger.createAccount({ name: "导入测试", kind: "cash", initial_balance: 0, currency: "CNY", sort: 0 });
      const input = '\uFEFF日期,金额,商家,备注\r\n2026-11-01,-12.30,"商家,分店","第一行\n含""引号"""\r\n';
      const rows = parseLedgerCsv(input, account.id);
      await expect(ledger.importTransactions([...rows, { ...rows[0], account_id: 999_999 }])).rejects.toThrow("导入账户不存在");
      await expect(ledger.transactions({ account: account.id, limit: 10, offset: 0 }))
        .resolves.toMatchObject({ total: 0 });

      await expect(ledger.importTransactions(rows)).resolves.toEqual({ inserted: 1, skipped: 0 });
      await expect(ledger.importTransactions(rows)).resolves.toEqual({ inserted: 0, skipped: 1 });
      const result = await ledger.transactions({ month: "2026-11", account: account.id, limit: -1, offset: 0 });
      expect(result.items[0]).toMatchObject({ merchant: "商家,分店", note: '第一行\n含"引号"', amount: 12.3 });
      expect(exportLedgerCsv(result.items)).toContain('2026-11-01,-12.30,"商家,分店","第一行\n含""引号"""');
      expect(exportLedgerCsv([{ ...result.items[0], merchant: "=1+1" }])).toContain('"\'=1+1"');
    } finally {
      connection.close();
    }
  });

  it("rejects invalid dates and uses Shanghai month boundaries", () => {
    expect(() => parseLedgerCsv("date,amount\n2026-02-30,100", 1)).toThrow("日期");
    expect(monthRange("2026-11")).toEqual({
      start: Date.parse("2026-10-31T16:00:00Z"),
      end: Date.parse("2026-11-30T16:00:00Z"),
    });
  });

  it("round-trips account and category names without losing fields", async () => {
    const connection = openDatabase(":memory:");
    try {
      runMigrations(connection);
      const db = drizzle(connection, { schema });
      const ledger = createLedgerService(db);
      const cash = await ledger.createAccount({
        name: "回导现金A", kind: "cash", initial_balance: 0, currency: "CNY", sort: 0,
      });
      const bank = await ledger.createAccount({
        name: "回导美元B", kind: "bank", initial_balance: 0, currency: "USD", sort: 1,
      });
      const categories = await ledger.categories();
      const food = categories.find((item) => item.name === "餐饮" && item.kind === "expense")!;
      const salary = categories.find((item) => item.name === "工资" && item.kind === "income")!;

      await ledger.createTransaction({
        account_id: cash.id, category_id: food.id, kind: "expense", amount: 12.3,
        occurred_at: parseLedgerDate("2026-11-02"), merchant: "面馆", note: "午饭", tags: [],
      });
      await ledger.createTransaction({
        account_id: bank.id, category_id: salary.id, kind: "income", amount: 1000,
        occurred_at: parseLedgerDate("2026-11-03"), merchant: "公司", note: "工资", tags: [],
      });

      const before = (await ledger.transactions({ month: "2026-11", limit: -1, offset: 0 })).items;
      const csv = exportLedgerCsv(before);
      const names = { accounts: await ledger.accounts(), categories: await ledger.categories() };
      const rows = parseLedgerCsv(csv, cash.id, names);

      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.merchant === "面馆")).toMatchObject({
        account_id: cash.id, category_id: food.id, kind: "expense", amount: 12.3,
        occurred_at: parseLedgerDate("2026-11-02"), merchant: "面馆", note: "午饭",
      });
      expect(rows.find((row) => row.merchant === "公司")).toMatchObject({
        account_id: bank.id, category_id: salary.id, kind: "income", amount: 1000,
      });

      await expect(ledger.importTransactions(rows)).resolves.toEqual({ inserted: 2, skipped: 0 });
      const reimported = (await ledger.transactions({ month: "2026-11", limit: -1, offset: 0 }))
        .items.filter((item) => item.external_id?.startsWith("csv:"));
      const roundTrip = exportLedgerCsv(reimported);
      expect(roundTrip).toContain('2026-11-02,-12.30,"面馆","午饭","回导现金A","餐饮"');
      expect(roundTrip).toContain('2026-11-03,1000.00,"公司","工资","回导美元B","工资"');
    } finally {
      connection.close();
    }
  });

  it("falls back for unknown names and fingerprints the resolved account id", () => {
    const csv = '\uFEFF日期,金额,商家,备注,账户,分类\r\n2026-11-01,-5.00,"测试","备注","未知账户","未知分类"\r\n';
    const rows = parseLedgerCsv(csv, 7, {
      accounts: [{ id: 1, name: "甲" }],
      categories: [{ id: 2, name: "餐饮", kind: "expense" }],
    });
    expect(rows[0]).toMatchObject({
      account_id: 7, category_id: null, kind: "expense", amount: 5,
      merchant: "测试", note: "备注",
    });
    expect(rows[0].external_id).toMatch(/^csv:/);

    const same = 'date,amount,merchant,note,account,category\n' +
      '2026-11-01,-5.00,"同款","同备注","甲","餐饮"\n' +
      '2026-11-01,-5.00,"同款","同备注"," usd card ","餐饮"\n';
    const parsed = parseLedgerCsv(same, 7, {
      accounts: [{ id: 1, name: "甲" }, { id: 3, name: "USD Card" }],
      categories: [{ id: 2, name: "餐饮", kind: "expense" }],
    });
    expect(parsed.map((row) => row.account_id)).toEqual([1, 3]);
    expect(parsed[0].external_id).not.toBe(parsed[1].external_id);
  });
});
