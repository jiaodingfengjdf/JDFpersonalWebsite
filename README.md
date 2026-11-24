# JDF 的秘密小窝

TypeScript + Next.js 16 单体应用。公开站点、管理后台和 API 共用同一个进程；数据库为 SQLite（WAL）。

Next.js 与 `eslint-config-next` 固定为同一版本；升级时请同步更新两者及锁文件。

## 本地启动

需要 **Node.js 22 LTS**（见 `.nvmrc`）和 **pnpm 11 或 12**。`better-sqlite3` 13 自带 Node-API 二进制，Windows x64 与 Linux x64 可直接安装。

Windows PowerShell 7

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
# 将生成的内容填入 .env.local 的 AUTH_SECRET
pnpm db:migrate
$env:ADMIN_USERNAME = 'admin'
$env:ADMIN_PASSWORD = Read-Host '输入自定管理员密码（至少 12 位）' -MaskInput
pnpm db:seed-admin
Remove-Item Env:ADMIN_PASSWORD
pnpm dev
```

Linux / macOS

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
# 编辑 .env.local，至少设置 AUTH_SECRET（32+ 字符）
pnpm db:migrate
ADMIN_USERNAME=admin ADMIN_PASSWORD='至少12位的强密码' pnpm db:seed-admin
pnpm dev
```

如果 Turbopack 开发缓存异常或登录页长时间停在 `Compiling /admin/login`：

```bash
pnpm dev:clean     # 删除 .next/dev 后重新启动
pnpm dev:webpack   # 备用：改用 webpack 开发服务器
```

- 公开站点：<http://localhost:3000>
- 后台登录：<http://localhost:3000/admin/login>
- 健康检查：<http://localhost:3000/api/health>

不提供默认管理员密码；`db:seed-admin` 对已存在的用户名会更新密码。

> `.env.local` 由 Next.js 运行时读取；`db:*` / `migrate:*` CLI 脚本只读取当前 shell 环境变量。若修改了 `DATABASE_PATH`，请在命令前显式传入。

生产环境执行 `pnpm db:migrate`、`pnpm build`、`pnpm start`。已有站点先备份 SQLite 和本地上传目录。Docker 构建命令为 `docker build -t kirameku:local .`，容器内将 `/data` 挂载为持久卷，并设置 `AUTH_SECRET` 与对外访问使用的 `FRONTEND_ORIGIN`。

## 兴趣模块

| 入口 | 使用方式 |
|:--|:--|
| `/bookmark`、`/admin/collection` | 收藏按类型、分类、标签与关键词分页。后台可导入浏览器导出的 HTML，每次最多 1000 条，按 URL 跳过重复项。新导入的书签默认私密。 |
| `/search` | 统一查找文章、说说、收藏、书架、影视、游戏、新闻与播客。旧入口 `/explore` 会跳转并保留关键词。 |
| `/ledger`、`/admin/ledger` | 前台按月查看收支、预算进度、每日趋势、支出分类与最近流水，可切换月份。管理员查看及导出月账单，按北京时间划分月份。通用 CSV 支持 UTF-8 与 GB18030，首行包含 `日期,金额,商家,备注`，后两列可省略。日期为 `YYYY-MM-DD`，支出为负数。导入归入录入表单选中的账户，重复导入同一批流水会跳过。支付宝、微信等原始账单需先转换列。 |
| `/library`、`/admin/library` | 上传可公开访问的 EPUB 或 TXT，单文件上限 50 MB。阅读位置在当前浏览器保存，管理员可同步到服务端。新文件位于 `UPLOAD_DIR/books`，随上传目录备份。旧文件若仍位于 `public/uploads/books` 可继续访问，迁移部署前请复制到持久卷的 `books` 目录。 |
| `/market`、`/admin/market` | 自选覆盖 A 股、公募基金、美股与美股指数（预置 SPX / NDX / DJIA）。报价：A 股与基金走腾讯，美股与指数走东方财富批量接口；分时/K 线走东方财富，基金走历史净值。支持分时、日、周、月四种维度，周/月线由日线按自然周/自然月聚合（开=首日开、收=末日收、高/低=区间极值）。指标行随维度切换口径：K 线给「本周开/本周高/本周低/上周收/本周量」（日线为今开/最高/最低/昨收/成交量，月线为上月收等），分时给当日开高低与昨收，基金给最新净值/上期净值/区间高低。指数以「点」计价，价格区不带 ¥/$，基金净值保留 4 位小数，分时横轴统一按北京时间。持仓按人民币/美元分别汇总，成本只在管理员界面显示。后台可设涨跌提醒（涨幅/跌幅/价格上穿/下穿），由通知调度器逐轮评估，需在「预警通知」启用 `market.alert` 并选择渠道；单条规则 30 分钟内不重复提醒。所有上游接口都有超时、内存缓存与站内快照降级，图表下方标注来源与抓取时间。 |
| `/news`、`/podcast`、`/nba`、`/digest` | 新闻和播客可在后台添加 RSS。赛程依赖 ESPN，行情依赖腾讯数据源。简报聚合本站已有数据，账本部分仅管理员可见。 |

## 目录

```text
app/
├── layout.tsx              # 根布局，仅 html/body
├── (site)/                 # 公开站点（导航、主题、背景、音乐、访客追踪）
├── (admin)/admin/          # 登录页 + 受保护的仪表盘
├── api/auth/               # 登录、登出、当前用户、改密
└── api/health/             # 健康检查
server/
├── auth/                   # JWT、Cookie、bcrypt、requireAdmin
├── db/                     # Drizzle schema、迁移、SQLite 连接
├── http/                   # 错误信封、requestId、日志、限流、同源校验
└── modules/                # 认证、仪表盘服务
scripts/
├── seed-admin.ts
├── db-migrate.ts
├── backup-db.ts / restore-db.ts
└── migrate/                # PostgreSQL → SQLite 导出/审计
```

## 预警通知

后台 `/admin/notifications` 提供站内预警推送：渠道配置、事件开关与阈值、手动推送、最近推送记录都在同一页。

- 渠道：Telegram Bot、邮件（SMTP，nodemailer）、Webhook（JSON POST，可选 HMAC-SHA256 签名）。渠道参数存在 `notification_channel` 表，bot token / SMTP 密码 / 签名密钥用 `AUTH_SECRET` 派生密钥做 AES-256-GCM 加密，接口只回显掩码。
- 事件：`backup.stale`、`disk.low`、`http.error_rate`、`http.not_found_burst`、`db.busy`、`site.health`、`content.pending`。每个事件可单独开关、选渠道、调阈值与冷却时间。
- 定时巡检：进程内调度器（`instrumentation.ts`）每 `NOTIFICATION_INTERVAL_MINUTES` 分钟跑一次检查；`NOTIFICATION_CHECKS=0` 可关闭，只保留手动推送。
- 外部推送：`POST /api/internal/notify`，需 `CRON_SECRET`（`Authorization: Bearer <secret>` 或 `x-kirameku-secret`），body 为 `{ eventKey, level, title, body, channels?, force?, fields?, link? }`，方便外部探针或自建巡检接入。
- 推送记录写入 `notification_log`，只保留最近 2000 条。

## 常用命令

| 命令 | 说明 |
|:---|:---|
| `pnpm dev` | 启动开发服务器 |
| `pnpm dev:clean` | 清除 `.next/dev` 后启动 |
| `pnpm dev:webpack` | 使用 webpack 启动（Turbopack 异常时备用） |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm test` | Vitest 单测 |
| `pnpm build` | 生产构建 |
| `pnpm db:migrate` | 应用未执行的 SQLite 迁移 |
| `pnpm db:seed-admin` | 创建/更新管理员 |
| `pnpm db:backup` | 在线备份 + 完整性校验 |
| `pnpm db:restore <file>` | 恢复备份（先停应用） |

数据库默认路径 `./data/kirameku.db`，由 `DATABASE_PATH` 覆盖。备份与迁移见 [数据库运维说明](./server/db/README.md)，兴趣模块的原始规划见 [兴趣中枢改造方案](./docs/personal-hub-plan.md)。已有 Markdown 文章可放入 `content/posts/` 后运行 `pnpm exec tsx scripts/import-demo-content.ts`。

## 内置 AI 助理（/assistant）

助理源码来自独立项目 `chatbot私人助理`（Vite + React PWA），现由本站的 Next.js 构建并在 `/assistant` 加载。

- 入口：站点导航「助理」→ `/assistant`，同页内渲染（原生 React 路由，不用 iframe、不跳新标签），返回直接点站点导航或浏览器后退。
- 实现：助理源码整体并入 `app/(site)/assistant/_app`（保留上游结构），`AssistantRuntime.tsx` 以 `dynamic(ssr:false)` 挂载，避免它的 store 在服务端碰 `window`。
- 样式隔离：上游 3600 行全局 CSS 经脚本收敛到 `.assistant-root` 作用域（`*.scoped.css`），主题变量与 `data-theme` 也只写在容器上，不影响站点深浅色。
- 布局兜底：`_app/styles/override.css` 把 `.app / .chat-screen` 锁成容器高度，防止底部输入框被裁。
- 首次使用：页面内「设置」填入 DeepSeek API Key；Key 存在浏览器 IndexedDB，不经过本站服务器。
- 直连可行：DeepSeek 接口对浏览器 origin 反射 CORS 头，因此不需要服务端代理。
- 语音输入需要麦克风。`next.config.mjs` 对 `/assistant` 单独放开 `microphone=(self)`。

### 同步上游助理

助理源码是从独立项目一次性并入 `app/(site)/assistant/_app` 的；上游更新时不要手工改，跑同步脚本：

```bash
node scripts/sync-assistant.mjs /path/to/chatbot私人助理          # 同步并重新作用域化 CSS
node scripts/sync-assistant.mjs /path/to/chatbot私人助理 --check   # 同步后跑 npx tsc --noEmit
ASSISTANT_SRC=/path/to/chatbot私人助理 node scripts/sync-assistant.mjs --dry-run
```

脚本会：复制 `<源项目>/src` → `_app`、把三份全局 CSS 收敛成 `*.scoped.css`、把主题读写改到 `.assistant-root` 容器、
改 CSS import、移除 `main.tsx`、重写 `override.css`，并在 `AssistantRuntime.tsx` / `page.tsx` 缺失时补出。
上游改动导致某个补丁匹配不上时，脚本会列出警告并以非 0 退出，按提示人工确认即可。

- 内置风格：原生壁纸、樱色晚霞、深海夜航、薄荷晴空、机甲黄昏、雪见夜空、黑客程序员、NBA 球场、绿色养眼、像素 8bit（后四套的壁纸在 public/theme/*.svg）。

一套「主题」= 背景（渐变或图片）+ 明暗倾向（亮/暗/跟随系统）+ 模糊度。数据存在 `theme_preset` 表，
同一时刻只有一行 `is_active = 1`（`0010_theme_preset.sql` 起，`0011_default_theme.sql` 把站点原有壁纸固化成默认主题）。

- 后台：`/admin/themes`（导航「主题管理」）可新建、编辑、排序、删除、设为默认；启用中的主题不能删除，需先启用别的。
- 公开接口：`GET /api/themes` 返回 `{ active, presets }`，前台布局在服务端读取后注入 `ThemePresetProvider`。
- 管理接口：`GET/POST /api/admin/themes`、`PUT/DELETE /api/admin/themes/:id`、`POST /api/admin/themes/:id/activate`。
- 前台切换：设置面板（导航栏齿轮）里选主题与明暗，选择只写浏览器 `localStorage`（`theme-preset` / `theme-mode`），不落库；
  未选择时跟随站点默认主题，主题的 `mode` 会作为初始明暗倾向。
- 上传：后台新建/编辑主题时，封面与背景图都支持直接上传（`POST /api/admin/upload/image`，按站点配置落本地 `uploads/`、OSS 或图床），也支持手填站内路径或外链；最多 20 张背景图，第一张默认作封面。
- 背景渲染：`BackgroundProvider` 按当前主题给出 `images / gradientColors / blur`，`BackgroundRenderer` 只负责画出来。
