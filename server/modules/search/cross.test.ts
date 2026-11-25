import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/server/db/migrate";
import { openDatabase, type DatabaseConnection } from "@/server/db/open";
import * as schema from "@/server/db/schema";
import { formatDayTime } from "@/lib/format";
import { searchCross } from "./cross";

let directory: string;
let connection: DatabaseConnection;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kirameku-cross-"));
  connection = openDatabase(path.join(directory, "kirameku.db"));
  runMigrations(connection);
  db = drizzle(connection, { schema });
});

afterEach(() => {
  connection.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("searchCross token semantics", () => {
  it("requires every whitespace token to appear, not the whole string as a substring", async () => {
    await db.insert(schema.collectionItem).values([
      { title: "AI 笔记", isPublic: 1 },
      { title: "投资心得", isPublic: 1 },
      { title: "AI 投资笔记", isPublic: 1 },
    ]);

    const result = await searchCross(db, "AI 投资");

    expect(result.total).toBe(1);
    expect(result.groups.flatMap((group) => group.items.map((item) => item.title))).toEqual([
      "AI 投资笔记",
    ]);
  });

  it("returns an empty result without building SQL conditions for a blank query", async () => {
    await db.insert(schema.collectionItem).values({ title: "不该出现", isPublic: 1 });

    await expect(searchCross(db, "   ")).resolves.toEqual({
      query: "   ",
      total: 0,
      groups: [],
    });
  });
});

describe("searchCross market hits", () => {
  it("finds a watch by code, links to /market?symbol= and shows market plus code", async () => {
    const inserted = await db.insert(schema.marketWatch)
      .values({ kind: "stock", code: "AAPL", name: "苹果公司", market: "us", secid: "105.AAPL" })
      .returning({ id: schema.marketWatch.id })
      .get();

    const result = await searchCross(db, "AAPL");
    const group = result.groups.find((entry) => entry.kind === "market");

    expect(group?.label).toBe("行情");
    expect(group?.items).toHaveLength(1);
    expect(group?.items[0]).toMatchObject({
      id: inserted.id,
      title: "苹果公司",
      detail: "美股 · AAPL",
      href: `/market?symbol=${inserted.id}`,
    });
    expect(result.total).toBe(1);
  });
});

describe("searchCross NBA hits", () => {
  it("merges teams and games into one NBA group with stable hrefs and details", async () => {
    const startAt = Date.UTC(2026, 0, 5, 4, 30);
    await db.insert(schema.nbaTeam).values({
      code: "ZZQA",
      nameEn: "ZZQA Test Team",
      nameZh: "专项验收球队",
      follow: 1,
    });
    await db.insert(schema.nbaGame).values({
      gameId: "zzqa-game-1",
      season: "2025-26",
      homeCode: "ZZQA",
      awayCode: "ZZQB",
      homeName: "专项验收球队",
      awayName: "专项验收客队",
      status: "final",
      startAt,
      updatedAt: 1_000,
    });

    const result = await searchCross(db, "专项验收球队");
    const group = result.groups.find((entry) => entry.kind === "nba");
    const items = [...(group?.items ?? [])].sort((a, b) => String(b.id).localeCompare(String(a.id)));

    expect(group?.label).toBe("NBA");
    expect(result.groups.filter((entry) => entry.kind === "nba")).toHaveLength(1);
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.id === "zzqa-game-1")).toMatchObject({
      title: "专项验收客队 @ 专项验收球队",
      detail: `${formatDayTime(startAt)} · 已结束`,
      href: "/nba",
    });
    expect(items.find((item) => item.id !== "zzqa-game-1")).toMatchObject({
      title: "专项验收球队",
      href: "/nba?follow=1",
    });
    expect(result.total).toBe(2);
  });

  it("caps the merged NBA group at eight items", async () => {
    const teams = Array.from({ length: 5 }, (_, index) => ({
      code: `CAP${index}`,
      nameEn: `Cap Team ${index}`,
      nameZh: `上限验收球队${index}`,
      follow: 0,
    }));
    const games = Array.from({ length: 6 }, (_, index) => ({
      gameId: `cap-game-${index}`,
      season: "2025-26",
      homeCode: `CAP${index}`,
      awayCode: `CAPX${index}`,
      homeName: `上限验收球队${index}`,
      awayName: `上限验收客队${index}`,
      status: "scheduled" as const,
      startAt: 1_000 + index,
      updatedAt: 2_000 + index,
    }));
    await db.insert(schema.nbaTeam).values(teams);
    await db.insert(schema.nbaGame).values(games);

    const result = await searchCross(db, "上限验收");

    expect(result.groups.find((entry) => entry.kind === "nba")?.items).toHaveLength(8);
    expect(result.total).toBe(8);
  });
});
