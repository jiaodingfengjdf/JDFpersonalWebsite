-- 导航栏「兴趣」下拉菜单：把新增模块挂到顶部导航（可在后台「导航菜单」里改）
INSERT INTO "site_config" ("key", "value", "updated_at")
SELECT
  'nav_dropdown',
  '{"enabled":true,"label":"兴趣","icon":"sparkles","links":[{"label":"新闻","href":"/news","description":"RSS 聚合"},{"label":"行情","href":"/market","description":"自选基金 / 股票"},{"label":"NBA","href":"/nba","description":"赛程与比分"},{"label":"简报","href":"/digest","description":"每日一览"},{"label":"书架","href":"/library","description":"EPUB / TXT 阅读"},{"label":"播客","href":"/podcast","description":"订阅收听"},{"label":"影视","href":"/watch","description":"想看 / 在看 / 看完"},{"label":"游戏","href":"/games","description":"在玩 / 通关"},{"label":"记账","href":"/ledger","description":"收支与预算"},{"label":"搜索","href":"/explore","description":"跨模块检索"}]}',
  CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "site_config" WHERE "key" = 'nav_dropdown');
