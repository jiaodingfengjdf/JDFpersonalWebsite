CREATE TABLE "watch_item" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'movie' CHECK ("kind" IN ('movie', 'tv', 'anime')),
  "title" TEXT NOT NULL,
  "year" INTEGER,
  "poster" TEXT NOT NULL DEFAULT '',
  "overview" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'want' CHECK ("status" IN ('want', 'watching', 'done', 'dropped')),
  "rating" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT NOT NULL DEFAULT '',
  "progress" TEXT NOT NULL DEFAULT '',
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "idx_watch_status" ON "watch_item" ("status");
