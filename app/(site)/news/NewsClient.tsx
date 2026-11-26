"use client";
/* eslint-disable @next/next/no-img-element -- 封面来自外部 RSS 源，域名不可预知 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Circle,
  ExternalLink,
  LoaderCircle,
  Newspaper,
  RefreshCw,
  Rss,
  Search,
  Star,
  X,
} from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import FilterTabs from "@/components/site/FilterTabs";
import GlassPanel from "@/components/site/GlassPanel";
import { formatRelativeTime } from "@/lib/format";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import type { FeedCategory, FeedItemView } from "@/server/modules/feed/contracts";
import NewsRssModal from "./NewsRssModal";

function requireModule(href: string): InterestModule {
  const entry = interestModuleByHref(href);
  if (!entry) throw new Error(`Missing interest module: ${href}`);
  return entry;
}

const MODULE = requireModule("/news");

const TABS: Array<{ key: FeedCategory | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "tech", label: "科技" },
  { key: "china", label: "国内" },
  { key: "world", label: "国际" },
  { key: "finance", label: "财经" },
  { key: "design", label: "设计" },
];

const PAGE_SIZE = 20;
const SUMMARY_COLLAPSE_LEN = 90;

type Tab = FeedCategory | "all";
type ParamsLike = { get(name: string): string | null };

interface ServerNewsQuery {
  tab: Tab;
  unread: boolean;
  starred: boolean;
  offset: number;
}

function readServerQuery(params: ParamsLike, canManage: boolean): ServerNewsQuery {
  const tab = TABS.find((entry) => entry.key === params.get("tab"))?.key ?? "all";
  const flag = (name: string) => {
    const value = params.get(name);
    return value === "true" || value === "1";
  };
  const rawOffset = Number(params.get("offset") ?? "0");
  return {
    tab,
    unread: canManage && flag("unread"),
    starred: canManage && flag("starred"),
    offset: Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
  };
}

function isSafeImageUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("/uploads/")) return true;
  return /^https?:\/\//i.test(url);
}

function NewsSkeletonRows() {
  return (
    <div role="status" aria-label="正在加载新闻" className="divide-y divide-white/30 dark:divide-white/10">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex animate-pulse gap-3.5 px-4 py-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-slate-300/60 dark:bg-slate-700/60" />
            <div className="h-3 w-full rounded bg-slate-200/70 dark:bg-slate-700/40" />
            <div className="h-3 w-2/3 rounded bg-slate-200/70 dark:bg-slate-700/40" />
            <div className="flex gap-2 pt-0.5">
              <div className="h-4 w-12 rounded bg-sky-500/15" />
              <div className="h-4 w-28 rounded bg-slate-200/60 dark:bg-slate-700/40" />
            </div>
          </div>
          <div className="h-16 w-24 shrink-0 rounded-lg bg-slate-200/60 dark:bg-slate-700/50" />
        </div>
      ))}
    </div>
  );
}

function NewsClientInner({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<Array<HTMLElement | null>>([]);

  const serverQuery = readServerQuery(searchParams, canManage);
  const { tab, unread, starred, offset } = serverQuery;
  const sourceFilter = searchParams.get("source") ?? "all";
  const urlKeyword = searchParams.get("q") ?? "";
  const [draftKeyword, setDraftKeyword] = useState<string | null>(null);
  const keyword = draftKeyword ?? urlKeyword;

  const [items, setItems] = useState<FeedItemView[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [receivedKey, setReceivedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const [updating, setUpdating] = useState<Set<number>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [fetchingFeeds, setFetchingFeeds] = useState(false);
  const [rssModalOpen, setRssModalOpen] = useState(false);
  const [banner, setBanner] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [brokenCovers, setBrokenCovers] = useState<Set<number>>(new Set());
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const request = useRef<AbortController | null>(null);
  const resolvedKeyRef = useRef<string | null>(null);

  const key = `${tab}:${unread}:${starred}:${offset}:${nonce}`;
  const loading = receivedKey !== key && failedKey !== key;
  const error = failedKey === key ? "新闻暂时无法加载，请重试。" : null;

  function buildHref(
    patch: Partial<{
      tab: Tab;
      unread: boolean;
      starred: boolean;
      offset: number;
      source: string;
      q: string;
    }>,
  ): string {
    const params = new URLSearchParams(searchParams.toString());
    const nextTab = patch.tab ?? tab;
    const nextUnread = patch.unread ?? unread;
    const nextStarred = patch.starred ?? starred;
    const nextOffset = patch.offset ?? offset;
    const nextSource = patch.source ?? sourceFilter;
    const nextQ = patch.q !== undefined ? patch.q : keyword;

    if (nextTab !== "all") params.set("tab", nextTab);
    else params.delete("tab");

    if (nextOffset > 0) params.set("offset", String(nextOffset));
    else params.delete("offset");

    if (nextUnread) params.set("unread", "true");
    else params.delete("unread");

    if (nextStarred) params.set("starred", "true");
    else params.delete("starred");

    if (nextSource && nextSource !== "all") params.set("source", nextSource);
    else params.delete("source");

    const trimmedQ = nextQ.trim();
    if (trimmedQ) params.set("q", trimmedQ);
    else params.delete("q");

    const serialized = params.toString();
    return serialized ? `${pathname}?${serialized}` : pathname;
  }

  function pushQuery(
    patch: Partial<{
      tab: Tab;
      unread: boolean;
      starred: boolean;
      offset: number;
      source: string;
      q: string;
    }>,
  ) {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (patch.q !== undefined) setDraftKeyword(null);
    setActiveIndex(-1);
    router.push(buildHref(patch), { scroll: false });
  }

  function handleKeywordChange(value: string) {
    setDraftKeyword(value);
    setActiveIndex(-1);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const serialized = params.toString();
      router.replace(serialized ? `${pathname}?${serialized}` : pathname, { scroll: false });
      setDraftKeyword(null);
    }, 240);
  }

  const refreshList = useCallback(() => {
    setActiveIndex(-1);
    if (offset !== 0) {
      router.replace(buildHref({ offset: 0 }), { scroll: false });
    }
    setNonce((value) => value + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, pathname, router, searchParams]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (resolvedKeyRef.current === key) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    let active = true;

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (tab !== "all") params.set("category", tab);
    if (unread) params.set("unread", "true");
    if (starred) params.set("starred", "true");

    fetch(`/api/news?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("News request failed");
        return (await response.json()) as {
          items?: FeedItemView[];
          total?: number;
          hasMore?: boolean;
        };
      })
      .then((json) => {
        if (!active) return;
        const page = json.items ?? [];
        setItems((prev) => {
          if (offset === 0) return page;
          const seen = new Set(prev.map((entry) => entry.id));
          const appended = page.filter((entry) => !seen.has(entry.id));
          return [...prev, ...appended];
        });
        setTotal(typeof json.total === "number" ? json.total : page.length);
        setHasMore(Boolean(json.hasMore));
        resolvedKeyRef.current = key;
        setReceivedKey(key);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        resolvedKeyRef.current = key;
        setFailedKey(key);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [key, tab, unread, starred, offset]);

  const patchItem = useCallback(
    async (id: number, body: { read?: boolean; starred?: boolean }) => {
      if (updating.has(id)) return;
      setUpdating((prev) => new Set(prev).add(id));
      setBanner(null);
      try {
        const response = await fetch(`/api/admin/news/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error("News update failed");
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...body } : item)));
      } catch {
        setBanner({ tone: "error", text: "保存新闻状态失败，请稍后重试。" });
      } finally {
        setUpdating((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [updating],
  );

  async function triggerAdminFeedFetch() {
    if (fetchingFeeds) return;
    setFetchingFeeds(true);
    setBanner(null);
    try {
      const response = await fetch("/api/admin/news/refresh", { method: "POST" });
      if (!response.ok) throw new Error("Feed refresh failed");
      const result = (await response.json()) as {
        fetched?: number;
        inserted?: number;
        failed?: number;
      };
      const failNote = result.failed ? `（${result.failed} 个源连接超时）` : "";
      setBanner({
        tone: "info",
        text: `抓取完成：共读取 ${result.fetched ?? 0} 条，新增 ${result.inserted ?? 0} 条${failNote}。`,
      });
      refreshList();
    } catch {
      setBanner({ tone: "error", text: "抓取订阅源失败，请检查网络或后台订阅源配置。" });
    } finally {
      setFetchingFeeds(false);
    }
  }

  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (item.source_name) {
        counts.set(item.source_name, (counts.get(item.source_name) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((item) => {
      if (unread && item.read) return false;
      if (starred && !item.starred) return false;
      if (sourceFilter !== "all" && item.source_name !== sourceFilter) return false;
      if (kw) {
        const haystack = `${item.title}\n${item.summary}\n${item.source_name}`.toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
  }, [items, unread, starred, sourceFilter, keyword]);

  const unreadOnPage = useMemo(
    () => (canManage ? visible.filter((item) => !item.read) : []),
    [canManage, visible],
  );

  async function markVisibleRead() {
    if (!canManage || markingAll || unreadOnPage.length === 0) return;
    setMarkingAll(true);
    setBanner(null);
    const targetIds = unreadOnPage.map((item) => item.id);
    try {
      const results = await Promise.allSettled(
        targetIds.map((id) =>
          fetch(`/api/admin/news/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ read: true }),
          }),
        ),
      );
      const succeeded = new Set<number>();
      results.forEach((res, idx) => {
        if (res.status === "fulfilled" && res.value.ok) {
          succeeded.add(targetIds[idx]);
        }
      });
      setItems((prev) =>
        prev.map((item) => (succeeded.has(item.id) ? { ...item, read: true } : item)),
      );
      if (succeeded.size < targetIds.length) {
        setBanner({ tone: "error", text: "部分条目未成功标记已读，请重试。" });
      }
    } finally {
      setMarkingAll(false);
    }
  }

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Keyboard navigation: j / k to move active row, Enter / o to open link, s to star
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (rssModalOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        if (event.key === "Escape") target.blur();
        return;
      }
      if (visible.length === 0) return;

      if (event.key === "j") {
        event.preventDefault();
        setActiveIndex((prev) => {
          const next = Math.min(visible.length - 1, prev + 1);
          requestAnimationFrame(() => {
            rowRefs.current[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          });
          return next;
        });
      } else if (event.key === "k") {
        event.preventDefault();
        setActiveIndex((prev) => {
          const next = prev <= 0 ? 0 : prev - 1;
          requestAnimationFrame(() => {
            rowRefs.current[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          });
          return next;
        });
      } else if (
        (event.key === "o" || (event.key === "Enter" && target === document.body)) &&
        activeIndex >= 0 &&
        activeIndex < visible.length
      ) {
        const item = visible[activeIndex];
        if (item && /^https?:\/\//i.test(item.link)) {
          event.preventDefault();
          window.open(item.link, "_blank", "noopener,noreferrer");
          if (canManage && !item.read) void patchItem(item.id, { read: true });
        }
      } else if (
        event.key === "s" &&
        canManage &&
        activeIndex >= 0 &&
        activeIndex < visible.length
      ) {
        const item = visible[activeIndex];
        if (item) {
          event.preventDefault();
          void patchItem(item.id, { starred: !item.starred });
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, canManage, patchItem, rssModalOpen, visible]);

  const initialLoading = loading && items.length === 0;
  const loadingMore = loading && items.length > 0;
  const hasFilters =
    tab !== "all" || unread || starred || sourceFilter !== "all" || keyword.trim() !== "";

  return (
    <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
            <Newspaper className="h-6 w-6 text-sky-500 md:h-7 md:w-7" />
            {MODULE.pageTitle}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500 dark:text-slate-400">
            <span>共 {total} 条聚合资讯 · 只存标题与摘要，点击前往原站阅读</span>
            <span className="hidden text-xs text-slate-400 md:inline">
              · 快捷键 j/k 移动 · o 打开{canManage ? " · s 星标" : ""}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <>
              <button
                type="button"
                onClick={() => setRssModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/60 bg-sky-500/15 px-3.5 py-1.5 text-xs font-medium text-sky-700 shadow-xs transition hover:bg-sky-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-sky-300"
              >
                <Rss className="h-3.5 w-3.5" />
                ＋ 订阅 RSS / 管理源
              </button>

              <button
                type="button"
                disabled={fetchingFeeds}
                onClick={() => void triggerAdminFeedFetch()}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-60"
              >
                {fetchingFeeds ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Rss className="h-3.5 w-3.5" />
                )}
                {fetchingFeeds ? "正在抓取源…" : "抓取最新源"}
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={refreshList}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/45 bg-white/50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新列表
          </button>
        </div>
      </div>

      {/* Category Tabs + Filter Toolbar */}
      <GlassPanel padding="sm" className="mb-4 space-y-3 bg-white/50 p-3.5 dark:bg-slate-800/50">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <FilterTabs
            items={TABS}
            value={tab}
            onChange={(next) => pushQuery({ tab: next, offset: 0, source: "all" })}
            aria-label="新闻分类"
            tabClassName="text-xs sm:text-sm"
            inactiveClassName="bg-white/50 dark:bg-slate-900/40"
          />

          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/40 bg-white/50 px-2.5 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={unread}
                  onChange={(event) => pushQuery({ unread: event.target.checked, offset: 0 })}
                  className="accent-sky-600"
                />
                只看未读
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/40 bg-white/50 px-2.5 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={starred}
                  onChange={(event) => pushQuery({ starred: event.target.checked, offset: 0 })}
                  className="accent-sky-600"
                />
                只看星标
              </label>
              {unreadOnPage.length > 0 ? (
                <button
                  type="button"
                  disabled={markingAll}
                  onClick={() => void markVisibleRead()}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-400/50 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-sky-300"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {markingAll ? "标记中…" : `本页标为已读 (${unreadOnPage.length})`}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="search"
              value={keyword}
              maxLength={100}
              onChange={(event) => handleKeywordChange(event.target.value)}
              placeholder="筛选当前列表关键词（标题 / 摘要 / 来源）…"
              aria-label="筛选新闻关键词"
              className="h-8 w-full rounded-full border border-white/50 bg-white/75 pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100"
            />
            {keyword ? (
              <button
                type="button"
                aria-label="清空新闻关键词"
                onClick={() => {
                  pushQuery({ q: "" });
                  searchInputRef.current?.focus();
                }}
                className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-500 hover:bg-slate-200/60 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              当前显示 {visible.length} 条{total > 0 ? ` / 共 ${total} 条` : ""}
            </span>

            <select
              aria-label="按来源筛选"
              value={sourceFilter}
              onChange={(event) => pushQuery({ source: event.target.value })}
              className="h-8 max-w-48 rounded-full border border-white/50 bg-white/75 px-3 text-xs font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200"
            >
              <option value="all">全部来源 ({sources.length})</option>
              {sources.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count})
                </option>
              ))}
            </select>
          </div>
        </div>
      </GlassPanel>

      {/* Banner Notification */}
      {banner ? (
        <div
          role={banner.tone === "error" ? "alert" : "status"}
          className={`mb-3 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs ${
            banner.tone === "error"
              ? "border-rose-200 bg-rose-50/90 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/60 dark:text-rose-200"
              : "border-sky-300/60 bg-sky-50/90 text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/60 dark:text-sky-200"
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            aria-label="关闭通知"
            onClick={() => setBanner(null)}
            className="rounded p-0.5 opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Content Panel */}
      {error ? (
        <AsyncState
          tone="error"
          title={error}
          description="可能是网络暂时波动，重试一次看看。"
          actionLabel="重试"
          onAction={refreshList}
          compact
        />
      ) : initialLoading ? (
        <GlassPanel className="overflow-hidden bg-white/55 dark:bg-slate-800/55">
          <NewsSkeletonRows />
        </GlassPanel>
      ) : visible.length === 0 ? (
        <div className="space-y-3">
          <AsyncState
            tone="empty"
            title={
              hasFilters
                ? "没有符合筛选条件的新闻"
                : canManage
                  ? "还没有新闻条目"
                  : "暂时还没有资讯条目"
            }
            description={
              hasFilters
                ? "试试重置分类、来源或关键词筛选条件。"
                : canManage
                  ? "点击下方按钮添加或订阅精选 RSS 源，或点击右上方「抓取最新源」。"
                  : undefined
            }
            actionLabel={
              hasFilters
                ? "重置筛选"
                : canManage && items.length === 0
                  ? "＋ 订阅 RSS / 管理源"
                  : undefined
            }
            onAction={
              hasFilters
                ? () =>
                    pushQuery({
                      tab: "all",
                      unread: false,
                      starred: false,
                      offset: 0,
                      source: "all",
                      q: "",
                    })
                : canManage && items.length === 0
                  ? () => setRssModalOpen(true)
                  : undefined
            }
            compact
          />
          {canManage && items.length === 0 && hasFilters ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setRssModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/60 bg-sky-500/10 px-3.5 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300"
              >
                <Rss className="h-3.5 w-3.5" />
                ＋ 订阅 RSS / 管理源
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <GlassPanel className="divide-y divide-white/35 overflow-hidden bg-white/55 dark:divide-white/10 dark:bg-slate-800/55">
          {visible.map((item, index) => {
            const starLabel = item.starred ? "取消星标" : "添加星标";
            const readLabel = item.read ? "标为未读" : "标为已读";
            const categoryLabel =
              TABS.find((tabItem) => tabItem.key === item.category)?.label ?? item.category;
            const isLongSummary = item.summary.length > SUMMARY_COLLAPSE_LEN;
            const summaryExpanded = expandedIds.has(item.id);
            const showCover = isSafeImageUrl(item.cover) && !brokenCovers.has(item.id);
            const isActiveRow = index === activeIndex;

            return (
              <article
                key={item.id}
                ref={(node) => {
                  rowRefs.current[index] = node;
                }}
                onClick={() => setActiveIndex(index)}
                className={`flex items-start gap-3.5 px-4 py-3.5 transition-colors ${
                  isActiveRow
                    ? "bg-sky-500/10 ring-2 ring-inset ring-sky-500/60"
                    : "hover:bg-white/30 dark:hover:bg-white/5"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 flex-1 text-sm font-semibold leading-snug">
                      {/^https?:\/\//i.test(item.link) ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            if (canManage && !item.read) void patchItem(item.id, { read: true });
                          }}
                          className={`inline-flex items-baseline gap-1 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-sky-400 ${
                            item.read
                              ? "font-normal text-slate-500 dark:text-slate-400"
                              : "text-slate-800 dark:text-slate-100"
                          }`}
                        >
                          <span className="line-clamp-2">{item.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 translate-y-0.5 opacity-55" />
                        </a>
                      ) : (
                        <span className="line-clamp-2 text-slate-800 dark:text-slate-100">
                          {item.title}
                        </span>
                      )}
                    </h2>
                  </div>

                  {item.summary ? (
                    <div className="mt-1">
                      <p
                        className={`text-xs leading-relaxed text-slate-600 dark:text-slate-300 ${
                          summaryExpanded ? "whitespace-pre-wrap break-words" : "line-clamp-2"
                        }`}
                      >
                        {item.summary}
                      </p>
                      {isLongSummary ? (
                        <button
                          type="button"
                          aria-expanded={summaryExpanded}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleExpand(item.id);
                          }}
                          className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-sky-600 hover:underline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400"
                        >
                          {summaryExpanded ? (
                            <>
                              收起摘要 <ChevronUp className="h-3 w-3" />
                            </>
                          ) : (
                            <>
                              展开摘要 <ChevronDown className="h-3 w-3" />
                            </>
                          )}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                    <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-medium text-sky-700 dark:text-sky-300">
                      {categoryLabel}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        pushQuery({
                          source: sourceFilter === item.source_name ? "all" : item.source_name,
                        });
                      }}
                      title="点击按此来源筛选"
                      className="font-medium text-slate-500 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-400 dark:hover:text-sky-300"
                    >
                      {item.source_name}
                    </button>
                    <span>· {formatRelativeTime(item.published_at)}</span>
                    {canManage && item.read ? <span className="text-slate-400">· 已读</span> : null}
                  </div>
                </div>

                {showCover ? (
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-200/60 dark:bg-slate-700/60">
                    <img
                      src={item.cover}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                      onError={() => {
                        setBrokenCovers((prev) => new Set(prev).add(item.id));
                      }}
                    />
                  </div>
                ) : null}

                {canManage ? (
                  <div className="flex shrink-0 items-center gap-0.5 self-start">
                    <button
                      type="button"
                      disabled={updating.has(item.id)}
                      aria-label={readLabel}
                      aria-pressed={item.read}
                      title={readLabel}
                      onClick={(event) => {
                        event.stopPropagation();
                        void patchItem(item.id, { read: !item.read });
                      }}
                      className={`rounded-full p-1.5 transition focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-40 ${
                        item.read
                          ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                          : "text-slate-400 hover:bg-sky-500/10 hover:text-sky-600"
                      }`}
                    >
                      {item.read ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Circle className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={updating.has(item.id)}
                      aria-label={starLabel}
                      aria-pressed={item.starred}
                      title={starLabel}
                      onClick={(event) => {
                        event.stopPropagation();
                        void patchItem(item.id, { starred: !item.starred });
                      }}
                      className={`rounded-full p-1.5 transition focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-40 ${
                        item.starred
                          ? "text-amber-500 hover:bg-amber-500/10"
                          : "text-slate-300 hover:bg-amber-500/10 hover:text-amber-400 dark:text-slate-500"
                      }`}
                    >
                      <Star className={`h-4 w-4 ${item.starred ? "fill-current" : ""}`} />
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}

          <div className="px-4 py-3 text-center">
            {loadingMore ? (
              <p role="status" className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin text-sky-500" />
                正在加载更多…
              </p>
            ) : hasMore ? (
              <button
                type="button"
                onClick={() => {
                  if (loading || items.length === 0) return;
                  pushQuery({ offset: items.length });
                }}
                className="rounded-full border border-white/45 bg-white/50 px-5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200"
              >
                加载更多（已加载 {items.length} / {total}）
              </button>
            ) : (
              <p className="text-[11px] text-slate-400">已显示全部 {items.length} 条</p>
            )}
          </div>
        </GlassPanel>
      )}

      {canManage && rssModalOpen ? (
        <NewsRssModal
          onClose={() => setRssModalOpen(false)}
          onFeedChanged={refreshList}
        />
      ) : null}
    </div>
  );
}

/** useSearchParams 需要 Suspense 边界；放在组件内部，避免改动页面文件。 */
export default function NewsClient({ canManage }: { canManage: boolean }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <GlassPanel className="overflow-hidden bg-white/55 dark:bg-slate-800/55">
            <NewsSkeletonRows />
          </GlassPanel>
        </div>
      }
    >
      <NewsClientInner canManage={canManage} />
    </Suspense>
  );
}
