---
version: alpha
name: "JDF 的秘密小窝"
description: "带可切换壁纸的中文个人网站和内容后台。"
colors:
  primary: "#0284C7"
  search: "#6366F1"
  ink: "#1E293B"
  night: "#0F172A"
  surface: "#FFFFFF"
typography:
  sans:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
  mono:
    fontFamily: "ui-monospace, monospace"
rounded:
  card: "1rem"
  control: "0.75rem"
components:
  button: {}
  card: {}
  input: {}
  dialog: {}
---

# JDF 的秘密小窝

前台的视觉重心是可切换的壁纸和轻透的内容面板。检索页使用靛蓝标识操作，收藏、阅读和行情沿用站点的天蓝。正文和数据密集面板提高底色不透明度，深色状态用 Tailwind 的 `dark:` 变体适配。同色系涨跌数据同时显示正负号。

现有 Tailwind 调色板和 `app/globals.css` 是运行时来源。前台玻璃卡片可沿用同页的半透明白色、`slate-800` 及浅色描边。后台优先复用 `components/ui` 的 Button、Card、Input 与 Dialog，管理页面用 AdminPageHeader、AdminError 和 AdminEmptyState。

移动端按内容自然换行，卡片可缩为单列，翻页与清除操作保留键盘焦点样式。收藏卡片和详情保持足够宽度容纳中文长标题。图表同时提供可展开的来源数据表。
