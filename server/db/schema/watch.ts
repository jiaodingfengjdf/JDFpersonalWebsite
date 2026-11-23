import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./columns";

/** 影视库：想看 / 在看 / 看完 */
export const watchItem = sqliteTable(
  "watch_item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull().default("movie"),
    title: text("title").notNull(),
    year: integer("year"),
    poster: text("poster").notNull().default(""),
    overview: text("overview").notNull().default(""),
    status: text("status").notNull().default("want"),
    rating: integer("rating").notNull().default(0),
    note: text("note").notNull().default(""),
    /** 剧集进度，例如 S02E03 */
    progress: text("progress").notNull().default(""),
    createdAt: createdAt().notNull(),
    updatedAt: updatedAt().notNull(),
  },
  (t) => [index("idx_watch_status").on(t.status)],
);
