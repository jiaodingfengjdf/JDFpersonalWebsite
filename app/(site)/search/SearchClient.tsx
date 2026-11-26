"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Clapperboard,
  Clock,
  ExternalLink,
  FileText,
  Gamepad2,
  Headphones,
  Loader2,
  MessageCircle,
  Newspaper,
  Search,
  Trash2,
  TrendingUp,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react";
import type { SearchResult } from "@/lib/api/search";
import { formatDate } from "@/lib/format";
import { INTEREST_MODULES } from "@/lib/interest-modules";
import { navDropdownIcons } from "@/lib/nav-dropdown-icons";
import type { CrossHit, CrossResult } from "@/server/modules/search/cross";

const RECENT_STORAGE_KEY = "recent-searches-v1";
const MAX_RECENT = 10;

type ModuleFilter = "all" | "post" | CrossHit["kind"];

const CROSS_ICON: Record<CrossHit["kind"], LucideIcon> = {
  collection: Bookmark,
  book: BookOpen,
  watch: Clapperboard,
  game: Gamepad2,
  news: Newspaper,
  moment: MessageCircle,
  podcast: Headphones,
  market: TrendingUp,
  nba: Trophy,
};

// localStorage 订阅器：配合 useSyncExternalStore 实现零 effect 级联渲染与跨标签同步。
const recentListeners = new Set<() => void>();

function subscribeRecent(listener: () => void): () => void {
  recentListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === RECENT_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    recentListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readRecentRaw(): string {
  try {
    return window.localStorage.getItem(RECENT_STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parseRecentList(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function writeRecentList(next: string[]): void {
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next.slice(0, MAX_RECENT)));
    for (const listener of recentListeners) listener();
  } catch {
    // 隐私模式或存储受限时静默降级
  }
}

function addRecentTerm(term: string): void {
  const clean = term.trim();
  if (!clean) return;
  const current = parseRecentList(readRecentRaw());
  const deduped = [clean, ...current.filter((item) => item !== clean)].slice(0, MAX_RECENT);
  writeRecentList(deduped);
}

/** 安全高亮匹配词（纯 React 节点，杜绝 XSS）。 */
function highlightText(text: string, query: string): ReactNode {
  const tokens = Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .filter(Boolean),
    ),
  ).sort((a, b) => b.length - a.length);

  if (!text || tokens.length === 0) return text;

  const pattern = tokens
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const lowerTokens = new Set(tokens.map((t) => t.toLowerCase()));
  const parts = text.split(regex);

  if (parts.length <= 1) return text;

  return parts.map((part, index) =>
    lowerTokens.has(part.toLowerCase()) ? (
      <mark key={index} className="rounded bg-indigo-500/20 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export default function SearchClient({
  initialQuery,
  initialResult,
  groups,
  incomplete,
}: {
  initialQuery: string;
  initialResult: SearchResult;
  groups: CrossResult["groups"];
  incomplete: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("all");
  const result: SearchResult = initialResult;
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const recentRaw = useSyncExternalStore(
    subscribeRecent,
    readRecentRaw,
    useCallback(() => "[]", []),
  );
  const recentSearches = useMemo(() => parseRecentList(recentRaw), [recentRaw]);

  useEffect(() => {
    if (initialQuery.trim()) {
      addRecentTerm(initialQuery);
    }
  }, [initialQuery]);

  function submit(next: string) {
    const q = next.trim();
    if (q) addRecentTerm(q);
    startTransition(() => {
      if (q === initialQuery) router.refresh();
      else router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    });
  }

  function removeRecent(term: string) {
    writeRecentList(recentSearches.filter((item) => item !== term));
  }

  function clearAllRecent() {
    writeRecentList([]);
  }

  const moduleTabs = useMemo(() => {
    const tabs: Array<{ key: ModuleFilter; label: string; count: number }> = [];
    const totalCount =
      result.hits.length + groups.reduce((sum, group) => sum + group.items.length, 0);
    if (totalCount === 0) return tabs;

    tabs.push({ key: "all", label: "全部", count: totalCount });
    if (result.hits.length > 0) {
      tabs.push({ key: "post", label: "文章", count: result.hits.length });
    }
    for (const group of groups) {
      tabs.push({ key: group.kind, label: group.label, count: group.items.length });
    }
    return tabs;
  }, [result.hits.length, groups]);

  const effectiveFilter: ModuleFilter = moduleTabs.some((t) => t.key === moduleFilter)
    ? moduleFilter
    : "all";

  const quickModules = useMemo(
    () => INTEREST_MODULES.filter((mod) => mod.href !== "/search" && !mod.requiresAdmin),
    [],
  );

  const busy = pending;
  const showEmptyState =
    initialQuery !== "" && !incomplete && result.hits.length === 0 && groups.length === 0;
  const showArticles =
    result.hits.length > 0 && (effectiveFilter === "all" || effectiveFilter === "post");
  const visibleGroups = groups.filter(
    (group) => effectiveFilter === "all" || effectiveFilter === group.kind,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 md:py-12 lg:px-8">
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-indigo-500 dark:text-slate-400"
        >
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Link>
      </div>

      <h1 className="mb-1 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
        站内搜索
      </h1>
      <p
        role={initialQuery ? "status" : undefined}
        className="mb-6 break-words text-sm text-slate-600 dark:text-slate-300"
      >
        {initialQuery
          ? `「${initialQuery}」的搜索结果`
          : "搜索文章、说说、收藏、书架、影视、游戏、新闻、播客、行情与 NBA。"}
      </p>

      <form
        noValidate
        className="relative mb-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={input}
          type="text"
          autoFocus={!initialQuery}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="输入关键词，多个词用空格分隔"
          aria-label="搜索关键词"
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          className="w-full rounded-2xl border border-slate-200/80 bg-white/70 py-3 pl-11 pr-32 text-sm text-slate-800 shadow-sm backdrop-blur transition-all placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-100"
        />
        {value && (
          <button
            type="button"
            aria-label="清除搜索"
            onClick={() => {
              setValue("");
              input.current?.focus();
              if (initialQuery) submit("");
            }}
            className="absolute right-24 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-600 hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-300"
          >
            <X className="size-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          搜索
        </button>
      </form>

      {incomplete && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          <span>部分搜索结果暂时无法加载。</span>
          <button
            type="button"
            onClick={() => submit(initialQuery)}
            className="rounded-lg bg-amber-950/10 px-2 py-1 text-xs font-medium hover:bg-amber-950/20 dark:bg-amber-100/10 dark:hover:bg-amber-100/20"
          >
            重试
          </button>
        </div>
      )}

      {/* 模块筛选胶囊栏 */}
      {initialQuery && moduleTabs.length > 0 && (
        <div
          role="tablist"
          aria-label="搜索结果模块筛选"
          className="mb-6 flex flex-wrap gap-2"
        >
          {moduleTabs.map((tab) => {
            const active = effectiveFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setModuleFilter(tab.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                  active
                    ? "border-indigo-500 bg-indigo-500 text-white shadow-sm"
                    : "border-slate-200/80 bg-white/65 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:bg-slate-800/55 dark:text-slate-300 dark:hover:border-indigo-400/50 dark:hover:text-indigo-300"
                }`}
              >
                {tab.label}{" "}
                <span className={`tabular-nums ${active ? "text-indigo-100" : "text-slate-400"}`}>
                  ({tab.count})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 空关键词态：最近搜索记录 + 全站兴趣模块快捷入口网格 */}
      {!initialQuery && (
        <div className="space-y-6">
          {recentSearches.length > 0 && (
            <section
              aria-labelledby="recent-searches-title"
              className="rounded-2xl border border-slate-200/80 bg-white/65 p-4 backdrop-blur dark:border-white/10 dark:bg-slate-800/55"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2
                  id="recent-searches-title"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  <Clock className="h-3.5 w-3.5 text-indigo-500" />
                  最近搜索
                </h2>
                <button
                  type="button"
                  onClick={clearAllRecent}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-slate-400 transition hover:bg-indigo-500/10 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:text-indigo-300"
                >
                  <Trash2 className="h-3 w-3" />
                  清空全部
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term) => (
                  <span
                    key={term}
                    className="inline-flex items-center rounded-full border border-indigo-200/70 bg-indigo-500/10 text-xs text-indigo-700 dark:border-indigo-400/25 dark:text-indigo-300"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setValue(term);
                        submit(term);
                      }}
                      className="max-w-[180px] truncate rounded-l-full py-1 pl-3 pr-1.5 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-500"
                    >
                      {term}
                    </button>
                    <button
                      type="button"
                      aria-label={`删除搜索记录 ${term}`}
                      onClick={() => removeRecent(term)}
                      className="mr-1 grid h-5 w-5 place-items-center rounded-full text-indigo-500/70 hover:bg-indigo-500/20 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:text-indigo-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section
            aria-labelledby="quick-modules-title"
            className="rounded-2xl border border-slate-200/80 bg-white/65 p-5 backdrop-blur dark:border-white/10 dark:bg-slate-800/55"
          >
            <div className="mb-3">
              <h2
                id="quick-modules-title"
                className="text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                全站快捷入口
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                可跨文章、说说、收藏与全部公开兴趣模块检索，或直接前往对应栏目浏览。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Link
                href="/posts"
                className="group flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white/70 p-3 transition hover:-translate-y-0.5 hover:border-indigo-400/60 hover:bg-indigo-500/5 dark:border-white/10 dark:bg-slate-800/60"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-500">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-800 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-300">
                    文章专栏
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">长文与笔记</span>
                </span>
              </Link>

              <Link
                href="/bookmark"
                className="group flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white/70 p-3 transition hover:-translate-y-0.5 hover:border-indigo-400/60 hover:bg-indigo-500/5 dark:border-white/10 dark:bg-slate-800/60"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-500">
                  <Bookmark className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-800 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-300">
                    收藏中心
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">好物与灵感</span>
                </span>
              </Link>

              {quickModules.map((mod) => {
                const Icon = navDropdownIcons[mod.icon] ?? Search;
                return (
                  <Link
                    key={mod.key}
                    href={mod.href}
                    className="group flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white/70 p-3 transition hover:-translate-y-0.5 hover:border-indigo-400/60 hover:bg-indigo-500/5 dark:border-white/10 dark:bg-slate-800/60"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-500">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-slate-800 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-300">
                        {mod.label}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {mod.navDescription}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* 文章搜索结果 */}
      {showArticles && (
        <section className="mb-7">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <FileText className="h-4 w-4 text-indigo-500" />
            <span>
              文章 ·{" "}
              {result.total > result.hits.length
                ? `共 ${result.total} 篇，展示前 ${result.hits.length} 篇`
                : `共 ${result.total} 篇`}
            </span>
          </h2>
          <ul className="space-y-3">
            {result.hits.map((hit) => (
              <li key={hit.id}>
                <Link
                  href={`/posts/${hit.slug}`}
                  className="group block rounded-2xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-indigo-300/60 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-white/10 dark:bg-slate-800/50 dark:hover:border-indigo-400/40"
                >
                  <div className="mb-1.5 flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                    <h3 className="text-base font-semibold text-slate-800 transition-colors group-hover:text-indigo-500 dark:text-slate-100">
                      {highlightText(hit.title, initialQuery)}
                    </h3>
                  </div>
                  {hit.snippet && (
                    <p className="mb-2 line-clamp-2 pl-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                      {highlightText(hit.snippet, initialQuery)}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pl-6 text-xs text-slate-400">
                    {hit.category && (
                      <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-indigo-500">
                        {hit.category}
                      </span>
                    )}
                    {hit.published_at && <span>{formatDate(hit.published_at)}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 跨兴趣模块搜索结果 */}
      {visibleGroups.map((group) => {
        const GroupIcon = CROSS_ICON[group.kind] ?? Search;
        return (
          <section key={group.kind} className="mb-7">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <GroupIcon className="h-4 w-4 text-indigo-500" />
              <span>
                {group.label} · {group.items.length} 条
              </span>
            </h2>
            <ul className="divide-y divide-slate-200/70 rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur dark:divide-white/10 dark:border-white/10 dark:bg-slate-800/60">
              {group.items.map((hit) => {
                const isExternal = /^https?:\/\//i.test(hit.href);
                const ItemIcon = CROSS_ICON[hit.kind] ?? GroupIcon;
                const className =
                  "group flex items-start justify-between gap-3 rounded-xl px-4 py-3 transition hover:bg-indigo-500/10 focus-visible:outline-2 focus-visible:outline-indigo-500";
                const body = (
                  <>
                    <div className="flex min-w-0 items-start gap-2.5">
                      <ItemIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-medium text-slate-800 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-300">
                          {highlightText(hit.title, initialQuery)}
                        </h3>
                        {hit.detail && (
                          <p className="mt-1 line-clamp-2 break-words text-xs text-slate-600 dark:text-slate-300">
                            {highlightText(hit.detail, initialQuery)}
                          </p>
                        )}
                      </div>
                    </div>
                    {isExternal && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-300">
                        外链
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={`${group.kind}-${hit.id}`}>
                    {isExternal ? (
                      <a href={hit.href} target="_blank" rel="noopener noreferrer" className={className}>
                        {body}
                      </a>
                    ) : (
                      <Link href={hit.href} className={className}>
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {showEmptyState && (
        <div className="rounded-2xl border border-dashed border-slate-200/80 py-14 text-center dark:border-white/10">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            没有找到相关内容，换个关键词试试。
          </p>
          {result.fuzzy && (
            <p className="mt-2 text-xs text-slate-400">
              换个更长一点的关键词试试，三个字以上搜得更准。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
