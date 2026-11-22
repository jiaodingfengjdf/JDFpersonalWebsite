-- 四套风格主题：黑客程序员 / NBA / 绿色养眼 / 二次元像素 8bit
-- 壁纸在 public/theme/*.svg；绿色养眼用纯渐变。
INSERT INTO "theme_preset" ("name", "description", "mode", "kind", "colors", "images", "blur", "cover", "is_active", "sort", "created_at", "updated_at") VALUES
  (
    '黑客程序员',
    '终端绿 · 扫描线与字符雨，暗色强对比',
    'dark',
    'image',
    '["#04070a","#06120c","#39ff14"]',
    '["/theme/hacker-terminal.svg"]',
    0,
    '/theme/hacker-terminal.svg',
    0, 60,
    CAST(strftime('%s','now') AS INTEGER) * 1000,
    CAST(strftime('%s','now') AS INTEGER) * 1000
  ),
  (
    'NBA 球场',
    '木地板球场线稿 + 篮球，暗色下压更清楚',
    'dark',
    'image',
    '["#c8792f","#8f4713","#1b1b1f"]',
    '["/theme/nba-court.svg"]',
    3,
    '/theme/nba-court.svg',
    0, 70,
    CAST(strftime('%s','now') AS INTEGER) * 1000,
    CAST(strftime('%s','now') AS INTEGER) * 1000
  ),
  (
    '绿色养眼',
    '低饱和豆绿渐变，长时间阅读眼睛不累',
    'light',
    'gradient',
    '["#eef7f0","#d7ecd9","#b7dfbd","#9ad3a6"]',
    '[]',
    0,
    '',
    0, 80,
    CAST(strftime('%s','now') AS INTEGER) * 1000,
    CAST(strftime('%s','now') AS INTEGER) * 1000
  ),
  (
    '像素 8bit',
    '像素天空、月亮与远山，锐利不模糊',
    'light',
    'image',
    '["#0b1440","#25357f","#3fb46f"]',
    '["/theme/pixel-8bit.svg"]',
    0,
    '/theme/pixel-8bit.svg',
    0, 90,
    CAST(strftime('%s','now') AS INTEGER) * 1000,
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
