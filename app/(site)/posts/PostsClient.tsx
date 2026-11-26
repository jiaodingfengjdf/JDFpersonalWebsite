"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowUpDown,
  BookOpen,
  Hash,
  LayoutGrid,
  List,
  Loader2,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import PostCard, {
  type PostOut,
  type PostViewMode,
} from "@/components/posts/PostCard";
import { getPosts, type CategoryItem } from "@/lib/api";

export type PostSortMode = "latest" | "views" | "likes";

const PAGE_SIZE = 12;
const FULL_FILTER_SIZE = 100;

function parseSortParam(raw: string | null): PostSortMode {
  if (raw === "views" || raw === "likes") return raw;
  return "latest";
}

function normalizeTagKey(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

function matchesTag(postTags: string[], targetTag: string): boolean {
  const targetLower = targetTag.trim().toLowerCase();
  const targetSlug = normalizeTagKey(targetTag);
  return postTags.some((t) => {
    const lower = t.trim().toLowerCase();
    return lower === targetLower || normalizeTagKey(t) === targetSlug;
  });
}

export default function PostsClient({
  initialCategories,
  initialPosts,
  initialCategory = null,
  initialTag = null,
  initialQuery = "",
  initialSort = "latest",
  initialFetchSize = PAGE_SIZE,
  initialError = false,
}: {
  initialCategories: CategoryItem[];
  initialPosts: PostOut[];
  initialCategory?: string | null;
  initialTag?: string | null;
  initialQuery?: string;
  initialSort?: PostSortMode;
  initialFetchSize?: number;
  initialError?: boolean;
}) {
  const categories = initialCategories;
  const [posts, setPosts] = useState<PostOut[]>(initialPosts);
  const [activeCategory, setActiveCategory] = useState<string | null>(
    initialCategory,
  );
  const [activeTag, setActiveTag] = useState<string | null>(initialTag);
  const [searchQuery, setSearchQuery] = useState<string>(initialQuery);
  const [sortBy, setSortBy] = useState<PostSortMode>(initialSort);
  const [viewMode, setViewMode] = useState<PostViewMode>("grid");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? "文章列表加载失败，请检查网络后重试。" : null,
  );
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(
    !initialError && initialPosts.length === initialFetchSize,
  );
  const [loadedBatchSize, setLoadedBatchSize] = useState(initialFetchSize);
  const [retryToken, setRetryToken] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const isFirstCategoryEffect = useRef(true);
  const isPopStateUpdate = useRef(false);

  // 恢复本地视图偏好（网格 / 紧凑列表）
  useEffect(() => {
    const saved = localStorage.getItem("posts-view-mode");
    if (saved === "grid" || saved === "list") {
      queueMicrotask(() => setViewMode(saved));
    }
  }, []);

  function handleViewModeChange(next: PostViewMode) {
    setViewMode(next);
    try {
      localStorage.setItem("posts-view-mode", next);
    } catch {
      // ignore storage quota errors
    }
  }

  // 支持浏览器前进/后退恢复筛选条件
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const rawCat = params.get("category")?.trim() || null;
      const matchedCat = rawCat
        ? categories.find(
            (cat) =>
              cat.slug.toLowerCase() === rawCat.toLowerCase() ||
              cat.name.toLowerCase() === rawCat.toLowerCase(),
          )?.slug ?? rawCat
        : null;
      const nextTag = params.get("tag")?.trim() || null;
      const nextQ = params.get("q")?.trim() ?? "";
      const nextSort = parseSortParam(params.get("sort"));

      isPopStateUpdate.current = true;
      setActiveCategory(matchedCat);
      setActiveTag(nextTag);
      setSearchQuery(nextQ);
      setSortBy(nextSort);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [categories]);

  // 同步当前筛选与排序状态到 URL（可分享、刷新保留）
  useEffect(() => {
    if (isPopStateUpdate.current) {
      isPopStateUpdate.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (activeCategory) params.set("category", activeCategory);
    if (activeTag) params.set("tag", activeTag);
    const trimmedQ = searchQuery.trim();
    if (trimmedQ) params.set("q", trimmedQ);
    if (sortBy !== "latest") params.set("sort", sortBy);

    const qs = params.toString();
    const nextUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [activeCategory, activeTag, searchQuery, sortBy]);

  const needsFullBatch =
    Boolean(searchQuery.trim()) ||
    Boolean(activeTag) ||
    sortBy !== "latest";

  // 分类切换、重试或激活客户端全文检索/排序但尚未拉全时请求接口
  useEffect(() => {
    const shouldUpgradeBatch =
      needsFullBatch && hasMore && loadedBatchSize < FULL_FILTER_SIZE;

    if (isFirstCategoryEffect.current) {
      isFirstCategoryEffect.current = false;
      if (!shouldUpgradeBatch && retryToken === 0) {
        return;
      }
    }

    let active = true;
    const targetSize = needsFullBatch ? FULL_FILTER_SIZE : PAGE_SIZE;

    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError(null);
      setPage(1);
    });

    getPosts({
      status: "published",
      page: 1,
      size: targetSize,
      ...(activeCategory ? { category: activeCategory } : {}),
    })
      .then((data) => {
        if (!active) return;
        setPosts(data);
        setLoadedBatchSize(targetSize);
        setHasMore(data.length === targetSize);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError("文章列表加载失败，请检查网络后重试。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeCategory, retryToken, needsFullBatch, hasMore, loadedBatchSize]);

  const handleLoadMore = () => {
    if (loading) return;
    const next = page + 1;
    setLoading(true);
    setError(null);
    getPosts({
      status: "published",
      page: next,
      size: loadedBatchSize,
      ...(activeCategory ? { category: activeCategory } : {}),
    })
      .then((data) => {
        setPosts((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...data.filter((item) => !seen.has(item.id))];
        });
        setPage(next);
        setHasMore(data.length === loadedBatchSize);
      })
      .catch(() => {
        setError("加载更多文章失败，请点击重试。");
      })
      .finally(() => setLoading(false));
  };

  // 从已加载文章中聚合标签药丸（保证 URL 传入的 activeTag 始终可见以便取消）
  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      for (const rawTag of post.tags) {
        const clean = rawTag.trim();
        if (!clean) continue;
        counts.set(clean, (counts.get(clean) ?? 0) + 1);
      }
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
      .slice(0, 18)
      .map(([name, count]) => ({ name, count }));

    if (
      activeTag &&
      !sorted.some((item) => matchesTag([item.name], activeTag))
    ) {
      sorted.unshift({ name: activeTag, count: 0 });
    }
    return sorted;
  }, [posts, activeTag]);

  // 客户端关键词过滤 + 标签过滤 + 排序
  const displayedPosts = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    const filtered = posts.filter((post) => {
      if (activeTag && !matchesTag(post.tags, activeTag)) {
        return false;
      }
      if (keyword) {
        const haystack = [
          post.title,
          post.description,
          post.category,
          ...post.tags,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }
      return true;
    });

    const copy = [...filtered];
    if (sortBy === "views") {
      copy.sort(
        (a, b) =>
          b.views - a.views ||
          new Date(b.published_at ?? b.created_at).getTime() -
            new Date(a.published_at ?? a.created_at).getTime(),
      );
    } else if (sortBy === "likes") {
      copy.sort(
        (a, b) =>
          b.likes - a.likes ||
          new Date(b.published_at ?? b.created_at).getTime() -
            new Date(a.published_at ?? a.created_at).getTime(),
      );
    } else {
      copy.sort((a, b) => {
        const pinDiff = Number(b.is_pinned) - Number(a.is_pinned);
        if (pinDiff !== 0) return pinDiff;
        return (
          new Date(b.published_at ?? b.created_at).getTime() -
          new Date(a.published_at ?? a.created_at).getTime()
        );
      });
    }
    return copy;
  }, [posts, activeTag, searchQuery, sortBy]);

  const hasActiveFilters =
    activeCategory !== null ||
    activeTag !== null ||
    searchQuery.trim() !== "" ||
    sortBy !== "latest";

  function clearAllFilters() {
    setActiveCategory(null);
    setActiveTag(null);
    setSearchQuery("");
    setSortBy("latest");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-12">
      {/* 页头 */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 md:mb-8"
      >
        <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
          <BookOpen className="w-5 h-5 md:w-7 md:h-7 text-sky-500" />
          <h1 className="text-xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">
            文章
          </h1>
        </div>
        <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 ml-7 md:ml-10">
          记录技术探索、学术研究与生活感悟
        </p>
      </motion.div>

      {/* 搜索栏 + 排序 + 视图切换工具栏 */}
      <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center gap-3">
        {/* 搜索框 */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文章标题、摘要或标签..."
            aria-label="搜索文章"
            maxLength={100}
            className="w-full rounded-2xl border border-white/40 dark:border-white/10 bg-white/65 dark:bg-slate-900/65 backdrop-blur-xl py-2.5 pl-10 pr-10 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-sky-500/60"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="清除搜索关键词"
              onClick={() => {
                setSearchQuery("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-500/10 transition-colors focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 排序选择 + 网格/列表切换 */}
        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2">
          <div
            role="group"
            aria-label="文章排序方式"
            className="inline-flex items-center gap-1 rounded-2xl border border-white/40 dark:border-white/10 bg-white/65 dark:bg-slate-900/65 backdrop-blur-xl p-1 shadow-sm"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 ml-2 mr-0.5 hidden sm:block" />
            {(
              [
                { key: "latest", label: "最新发布" },
                { key: "views", label: "最多阅读" },
                { key: "likes", label: "最多点赞" },
              ] as const
            ).map((opt) => {
              const active = sortBy === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSortBy(opt.key)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    active
                      ? "bg-sky-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-500/10"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="视图切换"
            className="inline-flex items-center gap-1 rounded-2xl border border-white/40 dark:border-white/10 bg-white/65 dark:bg-slate-900/65 backdrop-blur-xl p-1 shadow-sm"
          >
            <button
              type="button"
              aria-pressed={viewMode === "grid"}
              onClick={() => handleViewModeChange("grid")}
              title="网格视图"
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-sky-500 ${
                viewMode === "grid"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-500/10"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">网格视图</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "list"}
              onClick={() => handleViewModeChange("list")}
              title="紧凑列表"
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-sky-500 ${
                viewMode === "list"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-500/10"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">紧凑列表</span>
            </button>
          </div>
        </div>
      </div>

      {/* 分类筛选 */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-3 md:mb-4 flex flex-wrap gap-1.5 md:gap-2"
      >
        <FilterTab
          label="全部"
          count={null}
          active={activeCategory === null}
          onClick={() => setActiveCategory(null)}
        />
        {categories.map((cat) => (
          <FilterTab
            key={cat.id}
            label={cat.name}
            count={cat.post_count}
            active={activeCategory === cat.slug}
            onClick={() => setActiveCategory(cat.slug)}
          />
        ))}
      </motion.div>

      {/* 标签筛选药丸 */}
      {availableTags.length > 0 && (
        <div className="mb-5 md:mb-8 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mr-1">
            <Hash className="w-3.5 h-3.5 text-sky-500" />
            标签:
          </span>
          {availableTags.map((tagItem) => {
            const isSelected =
              activeTag !== null && matchesTag([tagItem.name], activeTag);
            return (
              <button
                key={tagItem.name}
                type="button"
                aria-pressed={isSelected}
                onClick={() =>
                  setActiveTag(isSelected ? null : tagItem.name)
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  isSelected
                    ? "bg-sky-600 text-white font-medium shadow-sm"
                    : "bg-white/55 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border border-white/40 dark:border-white/10 hover:border-sky-400/50 hover:text-sky-600 dark:hover:text-sky-400"
                }`}
              >
                <span>#{tagItem.name}</span>
                {tagItem.count > 0 && (
                  <span
                    className={`text-[10px] ${
                      isSelected
                        ? "text-white/80"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {tagItem.count}
                  </span>
                )}
              </button>
            );
          })}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 transition-colors ml-1 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <RotateCcw className="w-3 h-3" />
              重置筛选
            </button>
          )}
        </div>
      )}

      {/* 错误横幅（带重试路径） */}
      {error && (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-50/85 dark:bg-rose-950/60 backdrop-blur-xl px-4 py-3 text-xs sm:text-sm text-rose-800 dark:text-rose-200 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (posts.length > 0 && page > 1) {
                handleLoadMore();
              } else {
                setRetryToken((n) => n + 1);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 transition-colors focus-visible:outline-2 focus-visible:outline-rose-500"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重试
          </button>
        </div>
      )}

      {/* 文章网格 / 紧凑列表 */}
      {loading && posts.length === 0 ? (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6"
              : "flex flex-col gap-3"
          }
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className={`rounded-3xl bg-white/55 dark:bg-slate-800/55 backdrop-blur-xl border border-white/30 dark:border-white/10 animate-pulse ${
                viewMode === "grid" ? "h-72" : "h-24"
              }`}
            />
          ))}
        </div>
      ) : displayedPosts.length === 0 ? (
        !error && (
          <div className="flex flex-col items-center justify-center py-24 rounded-3xl bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border border-white/30 dark:border-white/10 text-slate-500 dark:text-slate-400">
            <BookOpen className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm md:text-base mb-3">
              {hasActiveFilters ? "没有找到匹配筛选条件的文章" : "暂无文章"}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-4 py-1.5 rounded-full text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 transition-colors focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                清除筛选条件
              </button>
            )}
          </div>
        )
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeCategory ?? "all"}-${viewMode}`}
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
                : "flex flex-col gap-3 md:gap-4"
            }
          >
            {displayedPosts.map((post, i) => (
              <div key={post.id} className="h-full">
                <PostCard post={post} index={i} viewMode={viewMode} />
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {/* 加载更多 */}
      {hasMore && displayedPosts.length > 0 && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-center mt-10"
        >
          <button
            type="button"
            onClick={handleLoadMore}
            className="px-6 py-2.5 md:px-8 md:py-3 rounded-2xl bg-white/65 dark:bg-slate-900/65 backdrop-blur-xl border border-white/40 dark:border-white/10 text-sm md:text-base font-medium text-slate-700 dark:text-slate-200 hover:border-sky-400/50 hover:text-sky-600 dark:hover:text-sky-400 transition-all duration-300 hover:-translate-y-0.5 shadow-sm focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            加载更多
          </button>
        </motion.div>
      )}

      {/* 加载中指示器（加载更多时） */}
      {loading && posts.length > 0 && (
        <div className="flex justify-center mt-10">
          <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
        </div>
      )}
    </div>
  );
}

/* ---------- 分类标签组件 ---------- */

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`relative px-3.5 py-1.5 md:px-5 md:py-2 rounded-2xl text-xs md:text-sm font-medium transition-all duration-300 focus-visible:outline-2 focus-visible:outline-sky-500 ${
        active
          ? "text-white shadow-lg shadow-sky-500/20"
          : "text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-white/10 hover:bg-white/80 dark:hover:bg-slate-800/80"
      }`}
    >
      {active && (
        <motion.div
          layoutId="activeCategoryBg"
          className="absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <span className="relative z-10">
        {label}
        {count !== null && count > 0 && (
          <span
            className={`ml-1.5 text-xs ${
              active ? "text-white/80" : "text-slate-400 dark:text-slate-500"
            }`}
          >
            {count}
          </span>
        )}
      </span>
    </button>
  );
}
