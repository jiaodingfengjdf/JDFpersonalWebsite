# Kirameku

TypeScript + Next.js 16 单体应用。公开站点、管理后台和 API 共用同一个进程；数据库为 SQLite（WAL）。

Next.js 与 `eslint-config-next` 固定为同一版本；升级时请同步更新两者及锁文件。

## 本地启动

需要 **Node.js 22 LTS**（见 `.nvmrc`；CI 同样使用 22）。从其他 Node 大版本切换后，重新编译 SQLite 原生模块：

```bash
pnpm install
pnpm rebuild better-sqlite3
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

数据库默认路径 `./data/kirameku.db`，由 `DATABASE_PATH` 覆盖。备份与迁移说明见 [`server/db/README.md`](./server/db/README.md)，整体方案见 [`../docs/单体化重写方案.md`](../docs/单体化重写方案.md)。

## 内置 AI 助理（/assistant）

助理是独立项目 `chatbot私人助理`（Vite + React PWA）的构建产物，放在 `public/assistant/`，不参与本站编译。

- 入口：站点导航「助理」→ `/assistant`，同页内渲染（原生 React 路由，不用 iframe、不跳新标签），返回直接点站点导航或浏览器后退。
- 实现：助理源码整体并入 `app/(site)/assistant/_app`（保留上游结构），`AssistantRuntime.tsx` 以 `dynamic(ssr:false)` 挂载，避免它的 store 在服务端碰 `window`。
- 样式隔离：上游 3600 行全局 CSS 经脚本收敛到 `.assistant-root` 作用域（`*.scoped.css`），主题变量与 `data-theme` 也只写在容器上，不影响站点深浅色。
- 布局兜底：`_app/styles/override.css` 把 `.app / .chat-screen` 锁成容器高度，防止底部输入框被裁。
- 首次使用：页面内「设置」填入 DeepSeek API Key；Key 存在浏览器 IndexedDB，不经过本站服务器。
- 直连可行：DeepSeek 接口对浏览器 origin 反射 CORS 头，因此不需要服务端代理。
- 重新构建：在助理项目内执行 `npm run build -- --base=/assistant/`，把 `dist/` 覆盖到本站 `public/assistant/`。
- 语音输入需要麦克风：`next.config.mjs` 对 `/assistant/:path*` 单独放开 `microphone=(self)`，其余页面仍禁用。

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
