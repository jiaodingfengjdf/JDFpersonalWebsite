import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { openDatabase, type DatabaseConnection } from "@/server/db/open";
import { runMigrations } from "@/server/db/migrate";
import * as schema from "@/server/db/schema";
import { GLOBAL_INDICES, type EmQuote } from "./eastmoney";
import { getQuotes, type Quote } from "./provider";
import { createMarketService, type MarketService } from "./service";

type QuoteBatch = { quotes: Map<string, EmQuote>; stale: boolean };
const quotesBySecidsMock = vi.hoisted(() =>
  vi.fn<(secids: string[]) => Promise<QuoteBatch>>(),
);

vi.mock("./eastmoney", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./eastmoney")>();
  return { ...actual, quotesBySecids: quotesBySecidsMock };
});

// 个股/基金走腾讯，测试里不打真实网络，只验证指数批次。
vi.mock("./provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./provider")>();
  return {
    ...actual,
    getQuotes: vi.fn(async () => new Map<string, { quote: Quote; stale: boolean }>()),
  };
});

describe("market alerts", () => {
  let directory: string;
  let sqlite: DatabaseConnection;
  let service: MarketService;

  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "market-alert-test-"));
    sqlite = openDatabase(path.join(directory, "test.db"));
    runMigrations(sqlite);
    service = createMarketService(drizzle(sqlite, { schema }));
  });

  afterAll(() => {
    sqlite.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("validates the watch exists before creating a rule", async () => {
    await expect(
      service.createAlert({ watch_id: 999_999, rule: "up_pct", threshold: 3, enabled: true }),
    ).rejects.toThrow();
  });

  it("creates, toggles and deletes a rule", async () => {
    const created = await service.create({
      market: "cn",
      kind: "stock",
      code: "600036",
      name: "招商银行",
      cost: null,
      shares: null,
      sort: 10,
    });
    const alert = await service.createAlert({
      watch_id: created.id,
      rule: "up_pct",
      threshold: 3,
      enabled: true,
    });

    const [row] = await service.alerts();
    expect(row).toMatchObject({
      id: alert.id,
      watch_id: created.id,
      name: "招商银行",
      rule: "up_pct",
      threshold: 3,
      enabled: true,
      last_fired_at: null,
    });

    await service.updateAlert(alert.id, { rule: "price_below", threshold: 1500, enabled: false });
    const [updated] = await service.alerts();
    expect(updated.rule).toBe("price_below");
    expect(updated.enabled).toBe(false);

    service.markAlertFired(alert.id);
    const [fired] = await service.alerts();
    expect(fired.last_fired_at).not.toBeNull();

    await service.removeAlert(alert.id);
    expect(await service.alerts()).toHaveLength(0);
  });

  it("removes a watch together with its rules", async () => {
    const created = await service.create({
      market: "cn",
      kind: "fund",
      code: "000002",
      name: "测试标的",
      cost: null,
      shares: null,
      sort: 20,
    });
    await service.createAlert({
      watch_id: created.id,
      rule: "down_pct",
      threshold: 2,
      enabled: true,
    });

    await service.remove(created.id);

    const orphan = sqlite
      .prepare("SELECT count(*) AS n FROM market_alert WHERE watch_id = ?")
      .get(created.id) as { n: number };
    expect(orphan.n).toBe(0);
  });
});

describe("market index quote dedup", () => {
  let directory: string;
  let sqlite: DatabaseConnection;
  let service: MarketService;

  const prices: Record<string, number> = {
    "1.000001": 3300,
    "0.399001": 11000,
    "100.SPX": 5800,
    "100.NDX": 20000,
    "100.DJIA": 42000,
  };

  beforeAll(() => {
    quotesBySecidsMock.mockImplementation(async (secids: string[]) => {
      const quotes = new Map<string, EmQuote>();
      for (const secid of secids) {
        quotes.set(secid, {
          secid,
          code: secid.split(".")[1] ?? "",
          name: `指数-${secid}`,
          price: prices[secid] ?? 1000,
          change: 10,
          changePct: 0.3,
          prevClose: (prices[secid] ?? 1000) - 10,
          updatedAt: Date.now(),
        });
      }
      return { quotes, stale: false };
    });

    directory = fs.mkdtempSync(path.join(os.tmpdir(), "market-index-test-"));
    sqlite = openDatabase(path.join(directory, "test.db"));
    runMigrations(sqlite);
    service = createMarketService(drizzle(sqlite, { schema }));
  });

  afterAll(() => {
    sqlite.close();
    fs.rmSync(directory, { recursive: true, force: true });
    quotesBySecidsMock.mockReset();
  });

  it("loads index secids in one batch and shares the snapshot with indices()", async () => {
    // 迁移自带 A 股与美股指数自选（000001 / SPX），正好覆盖双数据源场景。
    const [overview, indices] = await Promise.all([
      service.overview(),
      service.indices(),
    ]);

    for (const [code, secid] of [
      ["000001", "1.000001"],
      ["SPX", "100.SPX"],
    ] as const) {
      const fromWatch = overview.items.find(
        (item) => item.kind === "index" && item.code === code,
      );
      const fromBar = indices.find((item) => item.code === code);
      expect(fromWatch).toBeDefined();
      expect(fromBar).toBeDefined();
      expect(fromWatch?.price).toBe(prices[secid]);
      expect(fromWatch?.price).toBe(fromBar?.price);
      expect(fromWatch?.change_pct).toBe(fromBar?.change_pct);
      expect(fromWatch?.stale).toBe(fromBar?.stale);
    }

    const indexCalls = quotesBySecidsMock.mock.calls.filter((args) =>
      args[0].includes("1.000001"),
    );
    expect(indexCalls).toHaveLength(1);
    const secids = indexCalls[0][0];
    expect(new Set(secids).size).toBe(secids.length);
    for (const meta of GLOBAL_INDICES) expect(secids).toContain(meta.secid);

    // 腾讯侧只剩 A 股个股与基金，不再收到任何指数。
    const providerItems = vi
      .mocked(getQuotes)
      .mock.calls.flatMap((args) => args[0].map((item) => `${item.kind}:${item.code}`));
    expect(providerItems).not.toContain("index:000001");
    expect(providerItems).not.toContain("index:SPX");
  });
});
