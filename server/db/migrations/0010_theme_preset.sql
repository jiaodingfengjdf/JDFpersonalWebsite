CREATE TABLE "theme_preset" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "mode" TEXT NOT NULL DEFAULT 'auto' CHECK ("mode" IN ('light', 'dark', 'auto')),
  "kind" TEXT NOT NULL DEFAULT 'gradient' CHECK ("kind" IN ('gradient', 'image')),
  "colors" TEXT NOT NULL DEFAULT '[]',
  "images" TEXT NOT NULL DEFAULT '[]',
  "blur" INTEGER NOT NULL DEFAULT 0,
  "cover" TEXT NOT NULL DEFAULT '',
  "is_active" INTEGER NOT NULL DEFAULT 0 CHECK ("is_active" IN (0, 1)),
  "sort" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);

-- 同一时刻只允许一个启用中的主题；后台「启用」时会先清空其它行。
CREATE UNIQUE INDEX "uniq_theme_preset_active" ON "theme_preset" ("is_active") WHERE "is_active" = 1;

INSERT INTO "theme_preset" ("name", "description", "mode", "kind", "colors", "images", "blur", "cover", "is_active", "sort", "created_at", "updated_at") VALUES
  ('樱色晚霞', '粉紫渐变，偏亮的二次元黄昏底色', 'auto', 'gradient', '["#fbc2eb","#a18cd1","#a1c4fd"]', '[]', 0, '', 1, 10, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('深海夜航', '深蓝渐变，夜里更安静', 'dark', 'gradient', '["#0f172a","#1e3a8a","#312e81"]', '[]', 0, '', 0, 20, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('薄荷晴空', '浅色实拍背景，配轻模糊', 'light', 'image', '["#a1c4fd","#c2e9fb"]', '["/images/1.webp","/images/2.webp"]', 4, '/images/1.webp', 0, 30, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('机甲黄昏', '暗色实拍背景，重模糊更有氛围', 'dark', 'image', '["#312e81","#0f172a"]', '["/images/20.webp","/images/34.webp"]', 8, '/images/20.webp', 0, 40, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('雪见夜空', '冷色实拍背景，适合夜间阅读', 'dark', 'image', '["#0f172a","#1e293b"]', '["/images/119.webp","/images/121.webp"]', 12, '/images/119.webp', 0, 50, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
