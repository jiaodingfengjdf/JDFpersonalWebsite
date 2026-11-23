import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
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
      const account = await ledger.createAccount({ name: "导入测试", kind: "cash", initial_balance: 0, sort: 0 });
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
});
