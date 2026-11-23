import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt } from "./columns";

export const podcastShow = sqliteTable(
  "podcast_show",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    author: text("author").notNull().default(""),
    cover: text("cover").notNull().default(""),
    description: text("description").notNull().default(""),
    feedUrl: text("feed_url").notNull(),
    lastCheckedAt: integer("last_checked_at"),
    lastError: text("last_error").notNull().default(""),
    createdAt: createdAt().notNull(),
  },
  (t) => [uniqueIndex("uniq_podcast_feed").on(t.feedUrl)],
);

export const podcastEpisode = sqliteTable(
  "podcast_episode",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    showId: integer("show_id")
      .notNull()
      .references(() => podcastShow.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    title: text("title").notNull(),
    audioUrl: text("audio_url").notNull(),
    duration: integer("duration").notNull().default(0),
    publishedAt: integer("published_at").notNull().default(0),
    description: text("description").notNull().default(""),
    played: integer("played").notNull().default(0),
    position: real("position").notNull().default(0),
    createdAt: createdAt().notNull(),
  },
  (t) => [
    uniqueIndex("uniq_podcast_episode").on(t.showId, t.guid),
    index("idx_podcast_episode_pub").on(t.showId, t.publishedAt),
  ],
);
