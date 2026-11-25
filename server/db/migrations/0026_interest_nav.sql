-- 「兴趣」导航对齐：旧入口 /explore 改为 /search，并把 10 条链接的
-- label / description 与 lib/interest-modules.ts 保持一致。
--
-- 所有修改都是「按 href 覆盖成固定值」或精确字符串替换，重复执行结果不变；
-- 自定义链接、其它配置字段与顺序都保持原样。

-- 1) 非对象形态（例如早期裸数组配置）也能修掉旧入口。
UPDATE "site_config"
SET "value" = replace("value", '"/explore"', '"/search"'),
    "updated_at" = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE "key" = 'nav_dropdown'
  AND instr("value", '"/explore"') > 0;

-- 2) 对象形态：按 href 对齐文案；/explore 视作 /search。
WITH expected(href, label, description) AS (
  VALUES
    ('/news', '新闻', 'RSS 聚合'),
    ('/market', '行情', 'A 股 / 美股 / 基金'),
    ('/nba', 'NBA', '赛程与比分'),
    ('/digest', '简报', '每日一览'),
    ('/library', '书架', 'EPUB / TXT 阅读'),
    ('/podcast', '播客', '订阅收听'),
    ('/watch', '影视', '想看 / 在看 / 看完'),
    ('/games', '游戏', '在玩 / 通关 / 愿望单'),
    ('/ledger', '记账', '收支与预算'),
    ('/search', '搜索', '文章与各兴趣模块')
),
target AS (
  SELECT "id", "value"
  FROM "site_config"
  WHERE "key" = 'nav_dropdown'
    AND json_valid("value")
    AND json_type("value", '$.links') = 'array'
),
rebuilt AS (
  SELECT
    t."id" AS id,
    (
      SELECT json_group_array(json(
        CASE
          WHEN e.href IS NOT NULL
          THEN json_set(
            l.value,
            '$.href', e.href,
            '$.label', e.label,
            '$.description', e.description
          )
          ELSE l.value
        END
      ))
      FROM json_each(t."value", '$.links') AS l
      LEFT JOIN expected AS e
        ON e.href = CASE
          WHEN json_extract(l.value, '$.href') = '/explore' THEN '/search'
          ELSE json_extract(l.value, '$.href')
        END
      ORDER BY l.key
    ) AS links_json
  FROM target AS t
)
UPDATE "site_config"
SET "value" = json_set("site_config"."value", '$.links', json(r."links_json")),
    "updated_at" = CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM rebuilt AS r
WHERE "site_config"."id" = r."id";
