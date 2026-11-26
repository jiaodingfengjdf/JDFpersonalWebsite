-- 移除全部二次元 / 动漫壁纸 / 粉紫 / 像素风格主题预设，替换为现代极简主题组合。
DELETE FROM "theme_preset"
WHERE "name" IN ('原生壁纸', '樱色晚霞', '薄荷晴空', '机甲黄昏', '雪见夜空', '像素 8bit');

INSERT INTO "theme_preset" ("name", "description", "mode", "kind", "colors", "images", "blur", "cover", "is_active", "sort", "created_at", "updated_at")
SELECT '晴空极简', '清爽现代浅蓝灰渐变，干净通透适合长时间浏览', 'light', 'gradient', '["#f8fafc","#e0f2fe","#dbeafe","#f1f5f9"]', '[]', 0, '', 0, 10, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "theme_preset" WHERE "name" = '晴空极简');

INSERT INTO "theme_preset" ("name", "description", "mode", "kind", "colors", "images", "blur", "cover", "is_active", "sort", "created_at", "updated_at")
SELECT '暖纸书房', '低对比暖白纸张质感，专注阅读与写作', 'light', 'gradient', '["#faf8f5","#f3eee6","#e8dfd1"]', '[]', 0, '', 0, 20, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "theme_preset" WHERE "name" = '暖纸书房');

UPDATE "theme_preset"
SET "colors" = '["#0b1120","#0f172a","#1e293b","#1e3a5f"]',
    "description" = '沉稳午夜深蓝渐变，柔和护眼适合夜间浏览',
    "sort" = 30
WHERE "name" = '深海夜航';

UPDATE "theme_preset"
SET "sort" = 15
WHERE "name" = '绿色养眼';

-- 若当前没有激活主题，则默认启用「晴空极简」
UPDATE "theme_preset"
SET "is_active" = 1
WHERE "name" = '晴空极简'
  AND NOT EXISTS (SELECT 1 FROM "theme_preset" WHERE "is_active" = 1);
