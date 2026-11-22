import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./columns";

/** RSS 订阅源 */
export const feedSource = sqliteTable(
  "feed_source",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    category: text("category").notNull().default("tech"),
    enabled: integer("enabled").notNull().default(1),
    sort: integer("sort").notNull().default(0),
    lastFetchedAt: integer("last_fetched_at"),
    lastError: text("last_error").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uniq_feed_source_url").on(t.url), index("idx_feed_source_cat").on(t.category)],
);

/** 抓取到的条目 */
export const feedItem = sqliteTable(
  "feed_item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => feedSource.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    title: text("title").notNull(),
    link: text("link").notNull().default(""),
    summary: text("summary").notNull().default(""),
    cover: text("cover").notNull().default(""),
    publishedAt: integer("published_at").notNull().default(0),
    read: integer("read").notNull().default(0),
    starred: integer("starred").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uniq_feed_item").on(t.sourceId, t.guid),
    index("idx_feed_item_pub").on(t.publishedAt),
  ],
);
