-- 新闻 RSS 流：订阅源 + 条目
CREATE TABLE "feed_source" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'tech',
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "last_fetched_at" INTEGER,
  "last_error" TEXT NOT NULL DEFAULT '',
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "uniq_feed_source_url" ON "feed_source" ("url");
CREATE INDEX "idx_feed_source_cat" ON "feed_source" ("category");

CREATE TABLE "feed_item" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "source_id" INTEGER NOT NULL REFERENCES "feed_source" ("id") ON DELETE CASCADE,
  "guid" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "link" TEXT NOT NULL DEFAULT '',
  "summary" TEXT NOT NULL DEFAULT '',
  "cover" TEXT NOT NULL DEFAULT '',
  "published_at" INTEGER NOT NULL DEFAULT 0,
  "read" INTEGER NOT NULL DEFAULT 0,
  "starred" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "uniq_feed_item" ON "feed_item" ("source_id", "guid");
CREATE INDEX "idx_feed_item_pub" ON "feed_item" ("published_at");

INSERT INTO "feed_source" ("name", "url", "category", "sort", "created_at", "updated_at") VALUES
  ('少数派', 'https://sspai.com/feed', 'tech', 10, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('Hacker News', 'https://hnrss.org/frontpage', 'tech', 20, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('澎湃新闻', 'https://feedx.net/rss/thepaper.xml', 'china', 30, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('阮一峰的网络日志', 'https://www.ruanyifeng.com/blog/atom.xml', 'design', 40, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
