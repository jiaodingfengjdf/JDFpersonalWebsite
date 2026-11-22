-- 阅读书架
CREATE TABLE "library_book" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "title" TEXT NOT NULL,
  "author" TEXT NOT NULL DEFAULT '',
  "format" TEXT NOT NULL DEFAULT 'epub',
  "cover" TEXT NOT NULL DEFAULT '',
  "file_url" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL DEFAULT 0,
  "total_units" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'reading' CHECK ("status" IN ('unread', 'reading', 'done', 'dropped')),
  "rating" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT NOT NULL DEFAULT '',
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "idx_library_status" ON "library_book" ("status");

CREATE TABLE "library_progress" (
  "book_id" INTEGER PRIMARY KEY NOT NULL REFERENCES "library_book" ("id") ON DELETE CASCADE,
  "unit" INTEGER NOT NULL DEFAULT 0,
  "offset" REAL NOT NULL DEFAULT 0,
  "percent" REAL NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
