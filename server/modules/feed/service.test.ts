import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "@/server/db/migrate";
import { openDatabase, type DatabaseConnection } from "@/server/db/open";
import * as schema from "@/server/db/schema";
import { createFeedService, type FeedService } from "./service";

describe("feed listPage", () => {
  let directory: string;
  let sqlite: DatabaseConnection;
  let service: FeedService;

  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "feed-page-test-"));
    sqlite = openDatabase(path.join(directory, "test.db"));
    runMigrations(sqlite);
    service = createFeedService(drizzle(sqlite, { schema }));

    const now = Date.now();
    const source = sqlite
      .prepare(
        `INSERT INTO feed_source (name, url, category, enabled, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("测试源", "https://example.com/feed", "tech", 1, 0, now, now);

    const insertItem = sqlite.prepare(
      `INSERT INTO feed_item
        (source_id, guid, title, link, summary, cover, published_at, read, starred, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // published_at 从高到低：编号 1..5 即列表顺序。
    const rows: Array<[number, number, number]> = [
      [5000, 0, 1],
      [4000, 1, 0],
      [3000, 0, 0],
      [2000, 1, 1],
      [1000, 0, 1],
    ];
    for (const [index, [publishedAt, read, starred]] of rows.entries()) {
      insertItem.run(
        Number(source.lastInsertRowid),
        `guid-${index}`,
        `条目${index + 1}`,
        "",
        "",
        "",
        publishedAt,
        read,
        starred,
        now,
      );
    }
  });

  afterAll(() => {
    sqlite.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("uses one WHERE for COUNT and rows, and reports hasMore from total", async () => {
    const first = await service.listPage({ limit: 2, offset: 0 });
    expect(first.total).toBe(5);
    expect(first.items.map((item) => item.title)).toEqual(["条目1", "条目2"]);
    expect(first.hasMore).toBe(true);

    const second = await service.listPage({ limit: 2, offset: 2 });
    expect(second.total).toBe(5);
    expect(second.items.map((item) => item.title)).toEqual(["条目3", "条目4"]);

    const last = await service.listPage({ limit: 2, offset: 4 });
    expect(last.total).toBe(5);
    expect(last.items.map((item) => item.title)).toEqual(["条目5"]);
    expect(last.hasMore).toBe(false);
  });

  it("pushes category, unread and starred filters down to SQL", async () => {
    const unread = await service.listPage({ limit: 100, unread: true });
    expect(unread.total).toBe(3);
    expect(unread.items.every((item) => !item.read)).toBe(true);

    const starred = await service.listPage({ limit: 100, starred: true });
    expect(starred.total).toBe(3);
    expect(starred.items.every((item) => item.starred)).toBe(true);

    const combined = await service.listPage({ limit: 100, unread: true, starred: true });
    expect(combined.total).toBe(2);

    const otherCategory = await service.listPage({ limit: 100, category: "china" });
    expect(otherCategory.total).toBe(0);
  });
});
