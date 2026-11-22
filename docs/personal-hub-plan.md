# JDF 的秘密小窝 · 兴趣中枢改造方案（v0.1 草案）

> 目标：把「听歌看电影、收藏有趣网站、基金股票、看小说漫画、记账、游戏、NBA、新闻时事、播客电台、摄影」这些分散的日常，收进一个能长期用的个人站点；先加模块，再顺手优化现有模块。
>
> 本文只是方案，不含代码改动。看完请在第 6 节挑优先级，我再按里程碑实施。

---

## 0. 现状基线（已具备，直接复用）

| 能力 | 现状 | 位置 |
|:--|:--|:--|
| 技术栈 | Next.js 16 + React 19 + Tailwind 4 + Drizzle + SQLite(WAL) | 全站 |
| 前台 | 首页、文章、说说、留言、收藏夹、项目、友链、照片墙、归档、音乐、搜索、助理、花园 | `app/(site)/*` |
| 后台 | 文章/说说/项目/评论/留言/分类标签/友链/收藏夹/相册/媒体库/主题管理/站点设置/导航/访客/统计/备份/预警/审计 | `app/(admin)/admin/(protected)/*` |
| AI 助理 | DeepSeek（Anthropic 兼容协议）+ 长期记忆 + 笔记 + 联网搜索 + 读链接 + 生图，纯前端、密钥存本机 | `app/(site)/assistant/_app` |
| 主题 | 主题预设（渐变/图片/模糊/明暗），后台 CRUD，前台可切换，背景图支持上传 | `theme_preset` |
| 通用设施 | 图片上传（本地/OSS/图床）、TTL 缓存、限流、同源校验、审计日志、通知（Telegram/SMTP/Webhook）、RSS、sitemap、搜索 | `server/*` |
| 数据表 | post/chatter/album/photo/bookmark/project/message/comment/tag/category/visitor/notification/theme… | `server/db/schema` |

**已有的两个"半成品"要升级而不是重做**：收藏夹（`bookmark_category` + `bookmark_site`）目前只是"网址导航"，不够承载影视/音乐/商品/灵感；相册只到"照片分组"，缺 EXIF/地图/器材。

---

## 1. 兴趣 → 模块映射

| 你的日常 | 落成模块 | 类型 |
|:--|:--|:--|
| 收藏音乐 / 电影 / 有趣网站 | **M1 收藏中心**（升级现有收藏夹，统一条目：链接/影视/音乐/书/商品/灵感） | 优化 + 扩展 |
| 买基金、看股票 | **M2 行情看板**（自选列表、持仓成本、涨跌提醒、净值曲线） | 新增 |
| 理财记账 | **M3 记账本**（账户、分类、交易、预算、月度报表、账单导入） | 新增 |
| 看小说、漫画 | **M4 阅读书架**（EPUB/TXT + CBZ/图片，进度、书签、笔记） | 新增 |
| 看电影 | **M5 影视库**（想看/在看/看完 + 评分短评，TMDB 元数据） | 新增 |
| 听播客、电台 | **M6 播客台**（RSS 订阅、单集播放、收听进度） | 新增 |
| 新闻、时事 | **M7 新闻流**（RSS 聚合、分类、已读、AI 摘要、每日简报） | 新增 |
| 关注 NBA | **M8 NBA 赛程**（赛程/比分/排名、比赛提醒） | 新增 |
| 玩游戏 | **M9 游戏记录**（在玩/通关、时长、截图、Steam 同步） | 新增 |
| 摄影 | **M10 摄影升级**（EXIF/地图/器材/拍摄日记，基于现有相册） | 优化 + 扩展 |
| 全都要"一句话问助理" | **M11 助理工具化**（行情/账本/书架/赛程/新闻 查询工具 + 每日简报） | 新增 |
| 找东西 | **M12 全局搜索 & 归档**（跨模块检索、统一时间轴） | 优化 |

---

## 2. 总体架构

三条数据线，三种处理方式：

```
① 自建台账（我产生）  记账 / 持仓 / 书签 / 阅读进度 / 影视评分 / 游戏记录
        → SQLite 表 + 后台 CRUD + 前台只读

② 外部行情与元数据    基金股票行情 / NBA 比分 / TMDB / Steam / iTunes
        → server/api/* 代理 + TTL 缓存 + 失败降级，密钥只放服务端

③ 订阅流（别人产生）  新闻 RSS / 播客 RSS / 友链
        → RSS 抓取器（定时或按需）+ 摘要 + 已读状态
```

设计原则：

1. **一个模块 = schema + service + api + admin + 前台页**，完全照现有 5 段式，风格不跑偏。
2. **外部数据永不直连浏览器**（CORS + 密钥 + 限流），全部走本站 `/api/*`，带内存 TTL 缓存和降级文案。
3. **不做交易、不做资讯评论**：只做"看"和"记"，减少合规与运维负担。
4. **助理是入口不是孤岛**：给助理加"查本站数据"的工具，让它能回答"我这月花了多少""我的自选基金涨了吗"。

---

## 3. 模块设计

### M1 收藏中心（升级现有收藏夹）· 优先级 P0

现在 `bookmark_site` 只能存网址。升级为**统一收藏条目**，一套表承载多种类型。

```sql
-- 新增：收藏条目（保留旧表以兼容，页面逐步切换）
CREATE TABLE collection_item (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,           -- link | movie | music | book | product | idea
  title TEXT NOT NULL,
  url TEXT DEFAULT '',          -- 原链接
  cover TEXT DEFAULT '',        -- 封面（可上传）
  author TEXT DEFAULT '',       -- 导演/歌手/作者/商家
  category_id INTEGER,          -- 复用 bookmark_category
  tags TEXT DEFAULT '[]',       -- JSON 数组
  rating INTEGER DEFAULT 0,     -- 0-5
  status TEXT DEFAULT 'saved',  -- saved | doing | done | dropped
  note TEXT DEFAULT '',         -- 短评/备注
  meta TEXT DEFAULT '{}',       -- 类型专属：年份/时长/平台/价格…
  is_public INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0,
  created_at INTEGER, updated_at INTEGER
);
```

- 前台 `/bookmark` 改为「收藏中心」：类型 Tab + 标签筛选 + 卡片墙（封面/评分/状态），支持搜索。
- 后台新增「收藏」管理（列表 + 表单，含封面 `ImageUploader`、标签输入、批量导入浏览器书签 HTML）。
- 导入：Chrome/Edge 导出书签 HTML → 解析成条目；也支持粘贴 URL 自动抓标题/图标（服务端 fetch + 解析 `<title>`/og:image，带 SSRF 防护）。
- 助理工具：`search_collection`（按标签/类型/关键词）。

**工作量**：约 1 天（表 + 服务 + 双端页面 + 导入）。

---

### M2 行情看板 · 优先级 P0

自选基金 / 股票 / 指数，展示净值曲线与涨跌，**不接交易**。

```sql
CREATE TABLE market_watch (      -- 自选项
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,            -- 000001 / 110022 / sh600519
  kind TEXT NOT NULL,            -- fund | stock | index
  name TEXT DEFAULT '',          -- 缓存名称
  cost REAL, shares REAL,        -- 持仓成本与份额（可空）
  sort INTEGER DEFAULT 0,
  created_at INTEGER,
  UNIQUE(code, kind)
);
CREATE TABLE market_snapshot (   -- 历史快照（每日一根，画曲线）
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL, kind TEXT NOT NULL,
  price REAL, change_pct REAL, nav REAL,
  captured_at INTEGER
);
CREATE TABLE market_alert (      -- 涨跌/价格提醒
  id INTEGER PRIMARY KEY, code TEXT, kind TEXT,
  rule TEXT,        -- up_pct:3 | down_pct:-3 | price_above:1.5
  enabled INTEGER DEFAULT 1, last_fired_at INTEGER
);
```

数据源（服务端代理，60 秒缓存，失败返回上次快照）：

| 用途 | 接口 | 说明 |
|:--|:--|:--|
| A 股/指数实时 | `https://qt.gtimg.cn/q=sh000001,sz399001,sh600519` | 文本、GBK，需转码；稳定 |
| 基金盘中估值 | `https://fundgz.1234567.com.cn/js/110022.js` | JSONP 文本，取 gztime/gsz |
| 基金历史净值 | `https://api.fund.eastmoney.com/f10/lsjz?...` | 需 Referer；用于画曲线 |
| K 线（股票） | 东方财富 `push2his.eastmoney.com/api/qt/stock/kline/get` | 日线/周线 |

- 前台 `/market`：自选卡片（涨红跌绿可配置）+ 单标的详情（曲线用已有 `recharts`）+ 持仓汇总（成本/市值/浮动盈亏）。
- 后台：自选管理、持仓录入、提醒规则；**免责声明**固定展示"数据来自公开接口，仅供参考，不构成投资建议"。
- 定时：用现有 `instrumentation.ts` 内的调度器每 5 分钟抓一次，命中提醒规则走现有通知渠道（Telegram/邮件/Webhook）。
- 助理工具：`market_quote`（"我的基金今天怎么样"）、`portfolio_summary`。

**工作量**：约 1.5 天（含曲线、持仓、提醒）。

---

### M3 记账本 · 优先级 P0

```sql
CREATE TABLE ledger_account (    -- 账户：现金/微信/支付宝/银行卡/基金
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT, balance REAL DEFAULT 0,
  currency TEXT DEFAULT 'CNY', sort INTEGER, archived INTEGER DEFAULT 0
);
CREATE TABLE ledger_category (   -- 分类：餐饮/交通/工资/理财收益…
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT,  -- income | expense | transfer
  icon TEXT, parent_id INTEGER, sort INTEGER
);
CREATE TABLE ledger_txn (
  id INTEGER PRIMARY KEY, account_id INTEGER, category_id INTEGER,
  kind TEXT NOT NULL,            -- income | expense | transfer
  amount REAL NOT NULL,           -- 正数，方向由 kind 决定
  occurred_at INTEGER NOT NULL,
  merchant TEXT DEFAULT '', note TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  external_id TEXT,               -- 导入去重用
  created_at INTEGER, updated_at INTEGER
);
CREATE TABLE ledger_budget (
  id INTEGER PRIMARY KEY, category_id INTEGER, month TEXT,  -- 2026-11
  amount REAL, UNIQUE(category_id, month)
);
```

- 前台 `/ledger`：本月收支 + 预算进度 + 分类饼图/趋势（recharts）+ 最近流水；只读为主，记账在后台或助理。
- 后台：流水录入（快捷键盘流）、账户/分类/预算管理、CSV 导入（支付宝 GBK CSV、微信账单、招行/通用 CSV，列映射可配、按 `external_id` 去重）、月度/年度报表导出 CSV。
- 助理工具：`add_expense`（"记一笔 35 块午饭"）、`ledger_summary`（"这个月餐饮花了多少"）。
- 隐私：默认整站需要登录才能看账本（复用 `requireAdmin` 或新增访客可见开关）。

**工作量**：约 2 天（含导入与报表）。

---

### M4 阅读书架 · 优先级 P1

小说（EPUB/TXT）+ 漫画（CBZ/ZIP/图片序列）。

```sql
CREATE TABLE library_book (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT DEFAULT '',
  kind TEXT NOT NULL,             -- novel | comic
  format TEXT,                    -- epub | txt | cbz | images
  cover TEXT DEFAULT '', file_url TEXT NOT NULL, bytes INTEGER,
  total_units INTEGER,            -- 章节数 / 页数
  status TEXT DEFAULT 'reading',  -- unread | reading | done | dropped
  rating INTEGER DEFAULT 0, note TEXT DEFAULT '',
  created_at INTEGER, updated_at INTEGER
);
CREATE TABLE library_progress (
  book_id INTEGER PRIMARY KEY, unit INTEGER, offset REAL,
  percent REAL, updated_at INTEGER
);
CREATE TABLE library_bookmark (
  id INTEGER PRIMARY KEY, book_id INTEGER, unit INTEGER, offset REAL,
  excerpt TEXT, note TEXT, created_at INTEGER
);
```

- 阅读器：`epubjs`（EPUB 解析/分页）+ `jszip`（CBZ 解包）在前端按需加载；TXT 分章按正则切；漫画用翻页 + 预加载 + 键盘/手势。
- 上传：后台传文件到 `uploads/books/`（走现有存储层，注意大文件上限与断点续传另议）。
- 前台 `/library` 书架 → `/library/[id]` 阅读器：目录、进度、书签、笔记、双栏/单栏、字号/背景（复用主题）。
- 助理工具：`reading_progress`（"我在看什么""上次读到哪"）。

**工作量**：约 2.5 天（阅读器是大头，先 EPUB+TXT，漫画第二期）。

---

### M5 影视库 · 优先级 P2

```sql
CREATE TABLE watch_item (
  id INTEGER PRIMARY KEY, kind TEXT DEFAULT 'movie',   -- movie | tv | anime
  title TEXT NOT NULL, original_title TEXT, year INTEGER,
  tmdb_id INTEGER, poster TEXT, overview TEXT, runtime INTEGER,
  status TEXT DEFAULT 'want',   -- want | watching | done | dropped
  rating INTEGER DEFAULT 0, note TEXT DEFAULT '',
  progress TEXT DEFAULT '{}',   -- 剧集进度 {"season":1,"ep":3}
  created_at INTEGER, updated_at INTEGER
);
```

- 数据源：TMDB（需 API Key，国内访问建议配代理或自建反代）；无 Key 时支持手填标题/海报。
- 前台 `/watch`：想看/在看/看完三栏 + 评分墙；详情含简介、海报、你的短评。
- 后台：搜索 TMDB 一键入库、状态与评分编辑、批量导入豆瓣导出的 CSV（仅手动导入，不抓站）。
- 助理工具：`watch_list`（"我还有什么没看完"）。

**工作量**：约 1 天（TMDB 可选，无 Key 也能跑）。

---

### M6 播客台 · 优先级 P2

```sql
CREATE TABLE podcast_show (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT, cover TEXT,
  feed_url TEXT NOT NULL UNIQUE, description TEXT,
  last_checked_at INTEGER, created_at INTEGER
);
CREATE TABLE podcast_episode (
  id INTEGER PRIMARY KEY, show_id INTEGER, guid TEXT NOT NULL,
  title TEXT, audio_url TEXT, duration INTEGER, published_at INTEGER,
  played INTEGER DEFAULT 0, position REAL DEFAULT 0,
  UNIQUE(show_id, guid)
);
```

- 订阅：粘贴 RSS；用 `iTunes Search API`（免 key）按名字搜 feed。
- 前台 `/podcast`：节目列表 + 单集播放（HTML5 audio，支持倍速、记忆位置、跳 15s），收听进度写库。
- 抓取：按需刷新（打开页面时若 30 分钟未更新则后台抓一次），避免定时任务堆积。
- 助理工具：`podcast_latest`（"有什么新一期"）。

**工作量**：约 1.5 天（RSS 解析 + 播放器）。

---

### M7 新闻流 · 优先级 P1

```sql
CREATE TABLE feed_source (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT 'tech',  -- tech | world | china | finance | design
  enabled INTEGER DEFAULT 1, last_fetched_at INTEGER, error TEXT
);
CREATE TABLE feed_item (
  id INTEGER PRIMARY KEY, source_id INTEGER, guid TEXT NOT NULL,
  title TEXT NOT NULL, link TEXT, summary TEXT, content TEXT,
  cover TEXT, published_at INTEGER,
  read INTEGER DEFAULT 0, starred INTEGER DEFAULT 0,
  digest TEXT,                  -- AI 摘要（按需生成）
  UNIQUE(source_id, guid)
);
```

- 抓取：服务端 `fetch` + `fast-xml-parser`（或手写轻量解析），带 ETag/Last-Modified、失败退避；单源单次最多 50 条。
- 前台 `/news`：按分类的水流列表（标题/来源/时间），支持"只看未读""星标"、一键"AI 摘要"（调用助理同一套 DeepSeek Key？——**注意**：助理密钥存浏览器，新闻摘要要在服务端调模型，需要单独的 `DEEPSEEK_API_KEY` 环境变量，见 §5）。
- 每日简报 `/digest`：把"今日新闻 Top N + 行情 + NBA 比分 + 今天要还的账单"合成一页，可订阅 RSS；可选通过现有通知渠道每天推一次。
- 助理工具：`news_digest`、`search_news`。

**工作量**：约 1.5 天（不含 AI 摘要键配置）。

---

### M8 NBA 赛程 · 优先级 P1

```sql
CREATE TABLE nba_game (
  id INTEGER PRIMARY KEY, game_id TEXT UNIQUE, season TEXT,
  home TEXT, away TEXT, home_score INTEGER, away_score INTEGER,
  status TEXT,        -- scheduled | live | final
  start_at INTEGER, venue TEXT, updated_at INTEGER
);
```

- 数据源：ESPN 公开接口 `site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`（稳定、免 key、英文），本地维护队名中英映射表（30 条，一次性）。
- 前台 `/nba`：今日/近期赛程卡片、比分、胜负色块；球队筛选（我关注的队）。
- 后台：关注球队、是否显示比分、刷新间隔。
- 提醒：比赛开始前 30 分钟可发通知（复用通知渠道）。
- 助理工具：`nba_today`（"今天有湖人吗"）。

**工作量**：约 1 天。

---

### M9 游戏记录 · 优先级 P2

```sql
CREATE TABLE game_item (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, platform TEXT,
  cover TEXT, status TEXT DEFAULT 'playing',   -- playing | done | backlog | dropped
  hours REAL, rating INTEGER, note TEXT, started_at INTEGER, finished_at INTEGER,
  steam_app_id INTEGER
);
```

- 手动记录为主；可选 Steam 同步（`steamcommunity.com/id/<id>/games?tab=all&xml=1` 免 key，取时长/最近游玩）。
- 前台 `/games`：在玩 / 已通关 / 愿望单三栏，年度统计（通关数、总时长）。
- 助理工具：`game_backlog`。

**工作量**：约 0.5 天（不含 Steam 同步）。

---

### M10 摄影升级（基于现有相册）· 优先级 P1

- 上传时读 EXIF（拍摄时间/相机/镜头/光圈/快门/ISO/GPS），存进 `photo.meta`（新增 JSON 列）。
- 前台照片墙：按时间/相机/地点筛选；照片详情展示参数；有 GPS 的显示小地图（Leaflet + OSM，注意国内可用性，可换高德静态图）。
- 新增「拍摄日记」：一天一组照片 + 一段文字（`photo_diary` 表，或直接复用 chatter + 关联照片）。
- 器材库：`gear_item`（机身/镜头/胶片），照片可挂器材。
- 助理工具：`photo_stats`（"今年用 50mm 拍了多少张"）。

**工作量**：约 1.5 天。

---

### M11 助理工具化 + 每日简报 · 优先级 P1

助理是独立 SPA，工具在浏览器端执行（`CLIENT_TOOL_SCHEMAS`）。扩展方式：

1. 新增工具 `site_api`：白名单调用本站只读接口（`/api/market/summary`、`/api/ledger/summary`、`/api/library/current`、`/api/nba/today`、`/api/news/digest`），带上当前登录态（同源 cookie）。
2. 每个模块提供"给助理看"的紧凑 JSON（不要整页 HTML），控制 token。
3. 每日简报由服务端生成（`/digest` + `/api/digest`），可选推送。

> 注意：助理的 Key 存本机 IndexedDB，服务端摘要任务需要独立的 `DEEPSEEK_API_KEY`（放在 `.env.local`，不进仓库），两者互不影响。

**工作量**：约 1 天（工具 5 个 + 简报页）。

---

### M12 全局搜索 & 归档 · 优先级 P2

- 现有搜索只覆盖文章（`server/modules/search`）。扩展为跨模块：文章、说说、收藏、书、影视、新闻（标题级）。
- 用一个 `search_index` 视图或 UNION 查询，按 `updated_at` 排序，带类型徽标。
- 时间轴 `/timeline` 改为多来源合并（发布/收藏/读完/通关/大额支出可选）。

**工作量**：约 1 天。

---

## 4. 里程碑与顺序

| 阶段 | 内容 | 预计 |
|:--|:--|:--|
| **P0（先做）** | M1 收藏中心 + M3 记账本 + M2 行情看板 | 4–5 天 |
| **P1** | M7 新闻流 + M8 NBA + M10 摄影升级 + M11 助理工具化/简报 | 5 天 |
| **P2** | M4 阅读书架 + M6 播客 + M5 影视库 + M9 游戏 + M12 搜索 | 6 天 |

依赖关系：

```
M1 收藏中心 ─┬─> M5 影视库（复用条目/评分）
             └─> M12 搜索（统一条目源）
M3 记账本 ───> M11 助理工具（ledger_summary）
M2 行情看板 ─> M11（market_quote）＋ 每日简报
M7 新闻流 ───> 每日简报 ─> 通知渠道
M4 阅读书架 ─> M11（reading_progress）
```

**建议先做 P0 的三件**：收藏中心（立刻改善日常）、记账本（长期价值最高）、行情看板（每天都会看）。三件都完成后，站点从"博客"变成"个人中枢"，再铺订阅类模块。

---

## 5. 数据源、密钥与稳定性

| 模块 | 源 | 是否需要 Key | 备注 |
|:--|:--|:--|:--|
| 行情 | 腾讯/东方财富/天天基金 | 否 | 非官方接口，需限流 + 缓存 + 失败降级；禁止高频轮询 |
| NBA | ESPN 公开 API | 否 | 英文，队名映射本地化 |
| 影视 | TMDB / OMDb | 是 | 国内访问可能需要代理；无 Key 时手填 |
| 播客 | 各站 RSS + iTunes Search | 否 | RSS 解析容错 |
| 新闻 | RSS（新华/人民/澎湃/36Kr/少数派/RSSHub） | 否 | 自建 RSSHub 可选，避免公共实例限流 |
| 游戏 | Steam 公开 XML / Web API | 可选 | 免 key 方案够用 |
| 阅读 | 本地上传 | 否 | 大文件需单独限制与清理策略 |
| 助理/摘要 | DeepSeek | 是（服务端） | `DEEPSEEK_API_KEY`，仅摘要任务用 |

新增环境变量（全部写进 `.env.example`，值留空）：

```env
DEEPSEEK_API_KEY=            # 服务端摘要/简报用（与浏览器端助理的 Key 分开）
TMDB_API_KEY=                # 可选，影视元数据
NBA_TEAM=                    # 关注的球队，逗号分隔
```

落地细节：

- 所有外部请求统一走 `server/http/fetch-json.ts`（新增）：超时 8s、重试 1 次、UA 统一、按域名限流、返回 `{ data, cached, stale }`。
- 缓存：复用 `TtlCache`；行情 60s、赛程 5min、RSS 30min、TMDB 24h。
- 失败时前台显示「上次更新于 …」，不报白屏。

---

## 6. 需要你拍板的点

1. **优先级**：按我建议的 P0 三件先做，还是先做阅读/NBA/新闻？
2. **行情范围**：只做基金，还是基金+股票+指数都要（股票要接 K 线，多约半天）。
3. **记账可见性**：账本只自己看（登录后可见），还是允许访客看汇总（不含明细）？
4. **影视元数据**：接 TMDB（要 Key，可能需代理），还是先纯手动记录？
5. **阅读格式**：先 EPUB/TXT，漫画（CBZ）放第二期，是否可以？
6. **每日简报**：要不要每天定时推送到 Telegram/邮件（复用现有通知），还是只在站内看？

---

## 7. 不做的事（明确边界）

- 不做任何交易、下单、自动跟单；行情只做展示与提醒。
- 不抓取需要登录态的第三方数据（豆瓣书影音、微信、券商账户）。
- 不做新闻评论区、不做转载全文（只存标题+摘要+外链，尊重来源）。
- 不在浏览器里存服务端密钥；助理的 Key 仍只在本机 IndexedDB。
- 不引入第二个数据库；继续 SQLite，单文件备份沿用 `db:backup`。
