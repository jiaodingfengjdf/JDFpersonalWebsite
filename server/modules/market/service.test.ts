import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { openDatabase, type DatabaseConnection } from "@/server/db/open";
import { runMigrations } from "@/server/db/migrate";
import * as schema from "@/server/db/schema";
import { createMarketService, type MarketService } from "./service";

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
