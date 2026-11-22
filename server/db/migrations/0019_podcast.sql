-- 播客：节目 + 单集
CREATE TABLE "podcast_show" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "title" TEXT NOT NULL,
  "author" TEXT NOT NULL DEFAULT '',
  "cover" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "feed_url" TEXT NOT NULL,
  "last_checked_at" INTEGER,
  "last_error" TEXT NOT NULL DEFAULT '',
  "created_at" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "uniq_podcast_feed" ON "podcast_show" ("feed_url");

CREATE TABLE "podcast_episode" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "show_id" INTEGER NOT NULL REFERENCES "podcast_show" ("id") ON DELETE CASCADE,
  "guid" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "audio_url" TEXT NOT NULL,
  "duration" INTEGER NOT NULL DEFAULT 0,
  "published_at" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL DEFAULT '',
  "played" INTEGER NOT NULL DEFAULT 0,
  "position" REAL NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "uniq_podcast_episode" ON "podcast_episode" ("show_id", "guid");
CREATE INDEX "idx_podcast_episode_pub" ON "podcast_episode" ("show_id", "published_at");

INSERT INTO "podcast_show" ("title", "feed_url", "created_at") VALUES
  ('Syntax - Tasty Web Development Treats', 'https://feed.syntax.fm/rss', CAST(strftime('%s','now') AS INTEGER) * 1000);
