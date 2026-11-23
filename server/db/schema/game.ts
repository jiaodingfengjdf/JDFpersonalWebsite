import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./columns";

/** 游戏记录 */
export const gameItem = sqliteTable(
  "game_item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    platform: text("platform").notNull().default(""),
    cover: text("cover").notNull().default(""),
    status: text("status").notNull().default("playing"),
    hours: real("hours").notNull().default(0),
    rating: integer("rating").notNull().default(0),
    note: text("note").notNull().default(""),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    createdAt: createdAt().notNull(),
    updatedAt: updatedAt().notNull(),
  },
  (t) => [index("idx_game_status").on(t.status)],
);
