"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Bookmark,
  Boxes,
  Camera,
  Clock,
  Database,
  ExternalLink,
  FileText,
  FolderGit2,
  Gamepad2,
  Home,
  Loader2,
  MessageSquare,
  Moon,
  Music,
  PenSquare,
  RotateCcw,
  Rss,
  Search,
  Shield,
  Sparkles,
  Sun,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { INTEREST_MODULES } from "@/lib/interest-modules";
import { navDropdownIcons } from "@/lib/nav-dropdown-icons";
import type { SearchHit, SearchResult } from "@/lib/api/search";

const GARDEN_PASSWORD = "5201314";

interface CrossHitItem {
  kind: string;
  id: number | string;
  title: string;
  detail: string;
  href: string;
  updated_at: number;
}

interface CrossSearchResponse {
  query: string;
  total: number;
  groups: Array<{
    kind: string;
    label: string;
    items: CrossHitItem[];
  }>;
}

interface PaletteItem {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  badge?: string;
  icon: LucideIcon;
  keywords?: string;
  accent?: "sky" | "indigo" | "amber";
  external?: boolean;
  onSelect: () => void;
}

const CORE_ROUTES: ReadonlyArray<{
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  keywords: string;
}> = [
  { href: "/", label: "首页", description: "回到秘密小窝主页", icon: Home, keywords: "home index 主页" },
  { href: "/posts", label: "文章", description: "技术笔记、随笔与长文专栏", icon: BookOpen, keywords: "posts blog 博客 专栏" },
  { href: "/moments", label: "说说", description: "日常碎片、心情与碎碎念", icon: MessageSquare, keywords: "moments chatter 动态" },
  { href: "/bookmark", label: "收藏", description: "公开书签、好物与灵感收集", icon: Bookmark, keywords: "bookmark collection 书签" },
  { href: "/projects", label: "项目", description: "开源作品与个人实验项目", icon: FolderGit2, keywords: "projects repo 作品" },
  { href: "/photowall", label: "照片墙", description: "光影定格与相册精选", icon: Camera, keywords: "photos gallery 相册 摄影" },
  { href: "/timeline", label: "归档", description: "按时间轴回看历史创作", icon: Clock, keywords: "timeline archive 时间线" },
  { href: "/music", label: "音乐", description: "歌单播放与歌词同步体验", icon: Music, keywords: "music player 播放器 歌单" },
  { href: "/assistant", label: "AI 助理", description: "站内内容问答与智能检索", icon: Sparkles, keywords: "ai assistant chat 助手" },
];

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    ),
  );
}

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [postHits, setPostHits] = useState<SearchHit[]>([]);
  const [crossGroups, setCrossGroups] = useState<CrossSearchResponse["groups"]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [retrySeed, setRetrySeed] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const openPalette = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    setPostHits([]);
    setCrossGroups([]);
    setSearchError(false);
    setSearching(false);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
  }, []);

  // 全局打开事件与快捷键（/ 或 Ctrl/⌘ + Shift + K）
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        if (controller.signal.aborted) return;
        const session = payload as { isAdmin?: boolean } | null;
        setIsAdmin(Boolean(session?.isAdmin));
      })
      .catch(() => {
        // Ignore session fetch failure; default to non-admin palette.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onCustomOpen = () => {
      if (pathname.startsWith("/garden")) return;
      openPalette();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (pathname.startsWith("/garden")) return;

      const isCmdShiftK =
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "k";

      if (isCmdShiftK) {
        e.preventDefault();
        if (open) {
          closePalette();
        } else {
          openPalette();
        }
        return;
      }

      if (
        !open &&
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableElement(e.target) &&
        !isEditableElement(document.activeElement)
      ) {
        e.preventDefault();
        openPalette();
      }
    };

    window.addEventListener("open-command-palette", onCustomOpen);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("open-command-palette", onCustomOpen);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, openPalette, closePalette, pathname]);

  // 打开后聚焦搜索框
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const trimmedQuery = query.trim();
  const shouldLiveSearch =
    open && trimmedQuery.length >= 2 && trimmedQuery !== GARDEN_PASSWORD;

  // 220ms 防抖实时跨模块检索预览
  useEffect(() => {
    if (!shouldLiveSearch) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        const encoded = encodeURIComponent(trimmedQuery);
        const [postsRes, crossRes] = await Promise.all([
          fetch(`/api/search?q=${encoded}&limit=4`, {
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(`/api/search/cross?q=${encoded}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        if (!postsRes.ok && !crossRes.ok) {
          throw new Error("Search preview failed");
        }

        const postsData: SearchResult | null = postsRes.ok
          ? ((await postsRes.json()) as SearchResult)
          : null;
        const crossData: CrossSearchResponse | null = crossRes.ok
          ? ((await crossRes.json()) as CrossSearchResponse)
          : null;

        if (controller.signal.aborted) return;
        setPostHits(postsData?.hits ?? []);
        setCrossGroups(crossData?.groups ?? []);
        setSearchError(false);
      } catch {
        if (!controller.signal.aborted) {
          setSearchError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [shouldLiveSearch, trimmedQuery, retrySeed]);

  const navigate = useCallback(
    (href: string, external = false) => {
      closePalette();
      if (external) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        router.push(href);
      }
    },
    [closePalette, router],
  );

  const items = useMemo<PaletteItem[]>(() => {
    const lower = trimmedQuery.toLowerCase();
    const matchesQuery = (text: string) =>
      !lower || text.toLowerCase().includes(lower);

    const result: PaletteItem[] = [];

    // 彩蛋口令提示
    if (trimmedQuery === GARDEN_PASSWORD) {
      result.push({
        id: "secret-garden",
        group: "隐藏彩蛋",
        title: "解锁秘密花园",
        subtitle: "口令已就绪 · 按 Enter 立即前往 /garden",
        badge: "彩蛋",
        icon: Sparkles,
        accent: "amber",
        onSelect: () => {
          localStorage.setItem("garden-unlock", "true");
          closePalette();
          router.push("/garden");
        },
      });
    }

    // 全站搜索入口（有输入时置顶显示）
    if (trimmedQuery && trimmedQuery !== GARDEN_PASSWORD) {
      result.push({
        id: `full-search-${trimmedQuery}`,
        group: "全站检索",
        title: `全站搜索 "${trimmedQuery}"`,
        subtitle: "查看文章与九大兴趣模块的完整匹配结果",
        badge: "/search",
        icon: Search,
        accent: "indigo",
        onSelect: () => navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`),
      });
    }

    // 实时预览结果（>= 2 字符）
    if (shouldLiveSearch) {
      for (const post of postHits) {
        result.push({
          id: `post-hit-${post.id}`,
          group: "实时匹配 · 文章",
          title: post.title,
          subtitle: post.snippet || post.description || post.category || "文章正文匹配",
          badge: post.category || "文章",
          icon: FileText,
          accent: "sky",
          onSelect: () => navigate(`/posts/${post.slug}`),
        });
      }

      let crossCount = 0;
      for (const grp of crossGroups) {
        for (const hit of grp.items.slice(0, 2)) {
          if (crossCount >= 8) break;
          crossCount += 1;
          const isExt = /^https?:\/\//i.test(hit.href);
          result.push({
            id: `cross-hit-${grp.kind}-${String(hit.id)}`,
            group: "实时匹配 · 兴趣与收藏",
            title: hit.title,
            subtitle: hit.detail || grp.label,
            badge: grp.label,
            icon: Search,
            accent: "sky",
            external: isExt,
            onSelect: () => navigate(hit.href, isExt),
          });
        }
      }
    }

    // 快捷动作
    const quickActions: PaletteItem[] = [
      {
        id: "action-toggle-theme",
        group: "快捷指令",
        title: "切换深色/浅色主题",
        subtitle: theme === "dark" ? "当前：深色模式 · 点击切换浅色" : "当前：浅色模式 · 点击切换深色",
        badge: "外观",
        icon: theme === "dark" ? Sun : Moon,
        keywords: "theme dark light 深色 浅色 暗黑 明亮 主题 夜间",
        onSelect: () => {
          toggleTheme();
          closePalette();
        },
      },
      {
        id: "action-open-toolbox",
        group: "快捷指令",
        title: "打开百宝箱工具",
        subtitle: "24 款实用桌面小工具（计算器、热榜、汇率、二维码等）",
        badge: "小组件",
        icon: Boxes,
        keywords: "toolbox tools 百宝箱 工具箱 小工具",
        onSelect: () => {
          closePalette();
          window.dispatchEvent(new CustomEvent("open-toolbox"));
        },
      },
      {
        id: "action-open-games",
        group: "快捷指令",
        title: "打开摸鱼小游戏",
        subtitle: "2048、贪吃蛇、扫雷、俄罗斯方块、五子棋等",
        badge: "小游戏",
        icon: Gamepad2,
        keywords: "games mini play 摸鱼 小游戏 2048 贪吃蛇 扫雷",
        onSelect: () => {
          closePalette();
          window.dispatchEvent(new CustomEvent("open-games-panel"));
        },
      },
      {
        id: "action-assistant",
        group: "快捷指令",
        title: "前往 AI 助理 (/assistant)",
        subtitle: "基于站内知识库的对话问答助手",
        badge: "/assistant",
        icon: Sparkles,
        keywords: "ai assistant chat 助理 助手 问答",
        onSelect: () => navigate("/assistant"),
      },
    ];

    for (const act of quickActions) {
      if (matchesQuery(`${act.title} ${act.subtitle ?? ""} ${act.keywords ?? ""}`)) {
        result.push(act);
      }
    }

    if (isAdmin) {
      const adminActions: PaletteItem[] = [
        {
          id: "admin-dashboard",
          group: "管理员快捷指令",
          title: "进入管理后台",
          subtitle: "站点控制台与模块管理概览",
          badge: "/admin",
          icon: Shield,
          keywords: "admin dashboard 后台 管理 控制台",
          onSelect: () => navigate("/admin"),
        },
        {
          id: "admin-posts",
          group: "管理员快捷指令",
          title: "撰写新文章",
          subtitle: "文章管理、草稿编辑与发布",
          badge: "/admin/posts",
          icon: PenSquare,
          keywords: "admin posts write 新文章 写作 博客",
          onSelect: () => navigate("/admin/posts"),
        },
        {
          id: "admin-library",
          group: "管理员快捷指令",
          title: "书架管理",
          subtitle: "上传 EPUB / TXT 与管理阅读状态",
          badge: "/admin/library",
          icon: BookMarked,
          keywords: "admin library books 书架 图书 电子书",
          onSelect: () => navigate("/admin/library"),
        },
        {
          id: "admin-market",
          group: "管理员快捷指令",
          title: "行情自选",
          subtitle: "管理自选股票、基金与涨跌提醒",
          badge: "/admin/market",
          icon: TrendingUp,
          keywords: "admin market stock 行情 自选 股票",
          onSelect: () => navigate("/admin/market"),
        },
        {
          id: "admin-news",
          group: "管理员快捷指令",
          title: "RSS 订阅管理",
          subtitle: "维护新闻订阅源与抓取同步",
          badge: "/admin/news",
          icon: Rss,
          keywords: "admin news rss 订阅 新闻",
          onSelect: () => navigate("/admin/news"),
        },
        {
          id: "admin-backups",
          group: "管理员快捷指令",
          title: "系统备份",
          subtitle: "导出与管理数据库备份快照",
          badge: "/admin/backups",
          icon: Database,
          keywords: "admin backups 系统备份 导出 数据库",
          onSelect: () => navigate("/admin/backups"),
        },
      ];

      for (const act of adminActions) {
        if (matchesQuery(`${act.title} ${act.subtitle ?? ""} ${act.keywords ?? ""}`)) {
          result.push(act);
        }
      }
    }

    // 核心路由
    for (const route of CORE_ROUTES) {
      if (matchesQuery(`${route.label} ${route.description} ${route.href} ${route.keywords}`)) {
        result.push({
          id: `route-${route.href}`,
          group: "核心栏目",
          title: route.label,
          subtitle: route.description,
          badge: route.href,
          icon: route.icon,
          onSelect: () => navigate(route.href),
        });
      }
    }

    // 兴趣模块
    for (const mod of INTEREST_MODULES) {
      const Icon = navDropdownIcons[mod.icon];
      if (matchesQuery(`${mod.label} ${mod.pageTitle} ${mod.navDescription} ${mod.description} ${mod.href} ${mod.key}`)) {
        result.push({
          id: `interest-${mod.key}`,
          group: "兴趣模块",
          title: mod.label,
          subtitle: `${mod.navDescription} · ${mod.description}`,
          badge: mod.href,
          icon: Icon,
          onSelect: () => navigate(mod.href),
        });
      }
    }

    return result;
  }, [
    trimmedQuery,
    shouldLiveSearch,
    postHits,
    crossGroups,
    theme,
    isAdmin,
    toggleTheme,
    closePalette,
    navigate,
    router,
  ]);

  const activeIndex = items.length > 0 ? Math.min(selectedIndex, items.length - 1) : -1;

  // 键盘上下移动时保持高亮项在可视区域内
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-palette-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  // 分组展示并保留全局扁平索引
  const groupedSections = useMemo(() => {
    const sections: Array<{
      name: string;
      entries: Array<{ item: PaletteItem; flatIndex: number }>;
    }> = [];
    items.forEach((item, flatIndex) => {
      const last = sections[sections.length - 1];
      if (last && last.name === item.group) {
        last.entries.push({ item, flatIndex });
      } else {
        sections.push({ name: item.group, entries: [{ item, flatIndex }] });
      }
    });
    return sections;
  }, [items]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length > 0) {
        setSelectedIndex((prev) => (Math.min(prev, items.length - 1) + 1) % items.length);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length > 0) {
        setSelectedIndex(
          (prev) => (Math.min(prev, items.length - 1) - 1 + items.length) % items.length,
        );
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (trimmedQuery === GARDEN_PASSWORD) {
        localStorage.setItem("garden-unlock", "true");
        closePalette();
        router.push("/garden");
        return;
      }
      if (activeIndex >= 0 && items[activeIndex]) {
        items[activeIndex].onSelect();
      } else if (trimmedQuery) {
        navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
      }
    }
  }

  if (pathname.startsWith("/garden")) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={closePalette}
          className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-950/45 px-4 pt-[10vh] sm:pt-[13vh] backdrop-blur-xs"
        >
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label="全局快捷命令与搜索面板"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/50 bg-white/85 shadow-2xl backdrop-blur-2xl dark:border-white/15 dark:bg-slate-900/85"
          >
            {/* 顶部搜索栏 */}
            <div className="flex items-center gap-3 border-b border-slate-200/70 px-4 py-3.5 dark:border-white/10">
              {searching ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />
              ) : (
                <Search className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  const next = e.target.value;
                  setQuery(next);
                  setSelectedIndex(0);
                  if (next.trim().length < 2) {
                    setPostHits([]);
                    setCrossGroups([]);
                    setSearching(false);
                    setSearchError(false);
                  }
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="输入页面、文章、书影音、股票名称或快捷指令…"
                aria-label="搜索命令或全站内容"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-base text-slate-800 placeholder-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder-slate-500"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSelectedIndex(0);
                    setPostHits([]);
                    setCrossGroups([]);
                    setSearchError(false);
                    inputRef.current?.focus();
                  }}
                  aria-label="清空输入"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={closePalette}
                aria-label="关闭命令面板"
                className="rounded-lg border border-slate-200/80 bg-slate-100/80 px-2 py-1 font-mono text-[11px] text-slate-500 hover:bg-slate-200/80 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              >
                ESC
              </button>
            </div>

            {/* 实时检索失败重试条 */}
            {shouldLiveSearch && searchError && (
              <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
                <span>实时检索预览加载失败，仍可直接回车跳转搜索页。</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchError(false);
                    setSearching(true);
                    setRetrySeed((s) => s + 1);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 font-medium hover:bg-amber-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  重试
                </button>
              </div>
            )}

            {/* 列表区 */}
            <div
              ref={listRef}
              role="listbox"
              aria-label="匹配结果列表"
              className="max-h-[min(62vh,26rem)] overflow-y-auto overscroll-contain p-2"
            >
              {groupedSections.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  没有匹配的本地命令，按 Enter 进行全站检索
                </div>
              ) : (
                groupedSections.map((section) => (
                  <div key={section.name} className="mb-2 last:mb-0">
                    <div className="px-3 py-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                      {section.name}
                    </div>
                    <div className="space-y-0.5">
                      {section.entries.map(({ item, flatIndex }) => {
                        const Icon = item.icon;
                        const isSelected = flatIndex === activeIndex;
                        const isIndigo = item.accent === "indigo";
                        const isAmber = item.accent === "amber";

                        return (
                          <button
                            type="button"
                            key={item.id}
                            role="option"
                            aria-selected={isSelected}
                            data-palette-index={flatIndex}
                            onMouseEnter={() => setSelectedIndex(flatIndex)}
                            onClick={item.onSelect}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                              isSelected
                                ? isIndigo
                                  ? "bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
                                  : isAmber
                                    ? "bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                                    : "bg-sky-500/15 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100"
                                : "text-slate-700 hover:bg-slate-100/70 dark:text-slate-200 dark:hover:bg-slate-800/60"
                            }`}
                          >
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                                isSelected
                                  ? isIndigo
                                    ? "border-indigo-400/40 bg-indigo-500 text-white"
                                    : isAmber
                                      ? "border-amber-400/40 bg-amber-500 text-white"
                                      : "border-sky-400/40 bg-sky-600 text-white"
                                  : "border-slate-200/70 bg-white/70 text-slate-600 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-300"
                              }`}
                            >
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-medium">
                                  {item.title}
                                </span>
                                {item.external && (
                                  <ExternalLink
                                    className="h-3 w-3 shrink-0 opacity-60"
                                    aria-hidden="true"
                                  />
                                )}
                              </div>
                              {item.subtitle && (
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                  {item.subtitle}
                                </p>
                              )}
                            </div>

                            {item.badge && (
                              <span className="shrink-0 rounded-md bg-slate-200/60 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                {item.badge}
                              </span>
                            )}
                            <ArrowRight
                              className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                                isSelected
                                  ? "translate-x-0.5 opacity-100"
                                  : "opacity-0"
                              }`}
                              aria-hidden="true"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 底部快捷键提示栏 */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded bg-white px-1.5 py-0.5 font-mono shadow-2xs dark:bg-slate-800">
                    ↑↓
                  </kbd>
                  选择
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded bg-white px-1.5 py-0.5 font-mono shadow-2xs dark:bg-slate-800">
                    ↵
                  </kbd>
                  打开
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded bg-white px-1.5 py-0.5 font-mono shadow-2xs dark:bg-slate-800">
                    Esc
                  </kbd>
                  关闭
                </span>
              </div>
              <span className="hidden sm:inline">
                快捷键 <kbd className="font-mono">/</kbd> 或{" "}
                <kbd className="font-mono">Ctrl/⌘+Shift+K</kbd> · 长按{" "}
                <kbd className="font-mono">Ctrl/⌘+K</kbd> 唤起双环轮盘
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
