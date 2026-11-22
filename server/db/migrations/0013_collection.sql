-- 统一收藏条目：把「收藏夹」升级成收藏中心（链接/影视/音乐/书/商品/灵感）
CREATE TABLE "collection_item" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'link' CHECK ("kind" IN ('link', 'movie', 'music', 'book', 'product', 'idea')),
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL DEFAULT '',
  "cover" TEXT NOT NULL DEFAULT '',
  "author" TEXT NOT NULL DEFAULT '',
  "category_id" INTEGER REFERENCES "bookmark_category" ("id") ON DELETE SET NULL,
  "tags" TEXT NOT NULL DEFAULT '[]',
  "rating" INTEGER NOT NULL DEFAULT 0 CHECK ("rating" BETWEEN 0 AND 5),
  "status" TEXT NOT NULL DEFAULT 'saved' CHECK ("status" IN ('saved', 'doing', 'done', 'dropped')),
  "note" TEXT NOT NULL DEFAULT '',
  "meta" TEXT NOT NULL DEFAULT '{}',
  "is_public" INTEGER NOT NULL DEFAULT 1 CHECK ("is_public" IN (0, 1)),
  "sort" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX "idx_collection_kind" ON "collection_item" ("kind", "sort");
CREATE INDEX "idx_collection_category" ON "collection_item" ("category_id");
CREATE INDEX "idx_collection_created" ON "collection_item" ("created_at");

-- 把旧收藏夹里的网址并成 link 类型条目，保留分类与描述
INSERT INTO "collection_item"
  ("kind", "title", "url", "cover", "author", "category_id", "tags", "rating", "status", "note", "meta", "is_public", "sort", "created_at", "updated_at")
SELECT
  'link',
  s."name",
  s."url",
  COALESCE(s."icon", ''),
  '',
  s."category_id",
  COALESCE(NULLIF(s."platforms", ''), '[]'),
  0,
  'saved',
  COALESCE(s."description", ''),
  '{}',
  1,
  COALESCE(s."sort", 0),
  COALESCE(s."created_at", 0),
  COALESCE(s."updated_at", 0)
FROM "bookmark_site" s;
