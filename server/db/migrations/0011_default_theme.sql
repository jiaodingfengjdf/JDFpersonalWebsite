-- 把「站点原有壁纸」固化成一套主题并设为默认，
-- 这样升级后默认观感与之前（appearance.bgImages + 20px 模糊）完全一致，
-- 想换风格再去后台「主题管理」里切换即可。
INSERT INTO "theme_preset" ("name", "description", "mode", "kind", "colors", "images", "blur", "cover", "is_active", "sort", "created_at", "updated_at")
VALUES (
  '原生壁纸',
  '站点原有壁纸组合，保持升级前的观感',
  'auto',
  'image',
  '["#a1c4fd","#c2e9fb"]',
  '["/images/1.webp","/images/42.webp","/images/20.webp","/images/36.webp","/images/39.webp","/images/41.webp"]',
  20,
  '/images/42.webp',
  0,
  5,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000
);

UPDATE "theme_preset" SET "is_active" = 0;
UPDATE "theme_preset" SET "is_active" = 1 WHERE "name" = '原生壁纸';
