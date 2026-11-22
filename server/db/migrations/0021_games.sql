CREATE TABLE "game_item" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "title" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT '',
  "cover" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'playing' CHECK ("status" IN ('playing', 'done', 'backlog', 'dropped')),
  "hours" REAL NOT NULL DEFAULT 0,
  "rating" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT NOT NULL DEFAULT '',
  "started_at" INTEGER,
  "finished_at" INTEGER,
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "idx_game_status" ON "game_item" ("status");
