"use client";
/* eslint-disable @next/next/no-img-element -- 封面来自后台上传或外链，域名不可预知 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Tag,
  X,
} from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import FilterTabs, { type FilterTabItem } from "@/components/site/FilterTabs";
import GlassPanel from "@/components/site/GlassPanel";
import RatingStars from "@/components/site/RatingStars";
import { formatBytes, formatDate } from "@/lib/format";
import { BOOK_CATEGORIES, type BookStatus, type LibraryBookView } from "@/server/modules/library/contracts";
import { EditBookModal, UploadBookModal } from "./BookAdminModals";

type StatusFilter = "all" | BookStatus;
type FormatFilter = "all" | "epub" | "txt" | "cbz";
type SortKey = "updated" | "progress" | "rating" | "title";
type ViewMode = "grid" | "list";

const UNCATEGORIZED_KEY = "__uncategorized__";

interface StoredProgress {
  unit: number;
  offset: number;
  percent: number;
  location: string;
  updatedAt?: number;
}

const STATUS_LABEL: Record<BookStatus, string> = {
  reading: "在读",
  unread: "未读",
  done: "读完",
  dropped: "搁置",
};

const STATUS_BADGE_CLASS: Record<BookStatus, string> = {
  reading: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  unread: "bg-slate-500/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  dropped: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
};

function parseStatusFilter(value: string | null): StatusFilter {
  if (value === "reading" || value === "unread" || value === "done" || value === "dropped") {
    return value;
  }
  return "all";
}

function parseFormatFilter(value: string | null): FormatFilter {
  if (value === "epub" || value === "txt" || value === "cbz") return value;
  return "all";
}

function parseSortKey(value: string | null): SortKey {
  if (value === "updated" || value === "progress" || value === "rating" || value === "title") {
    return value;
  }
  return "updated";
}

function parseViewMode(value: string | null): ViewMode {
  return value === "list" ? "list" : "grid";
}

function parseStoredProgress(raw: string | null): StoredProgress | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.unit === "number" &&
      Number.isFinite(parsed.unit) &&
      parsed.unit >= 0
    ) {
      const percent =
        typeof parsed.percent === "number" && Number.isFinite(parsed.percent)
          ? Math.min(100, Math.max(0, parsed.percent))
          : 0;
      const offset =
        typeof parsed.offset === "number" && Number.isFinite(parsed.offset)
          ? Math.min(1, Math.max(0, parsed.offset))
          : 0;
      const location = typeof parsed.location === "string" ? parsed.location : "";
      const updatedAt =
        typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : undefined;
      return { unit: parsed.unit, offset, percent, location, updatedAt };
    }
  } catch {
    // Ignore malformed JSON.
  }
  return null;
}

function readBrowserProgressMap(
  books: LibraryBookView[],
  isAdmin: boolean,
): Record<number, StoredProgress> {
  const map: Record<number, StoredProgress> = {};
  try {
    for (const book of books) {
      if (isAdmin) {
        const adminSaved =
          parseStoredProgress(localStorage.getItem(`library-progress-v2-admin-${book.id}`)) ??
          parseStoredProgress(localStorage.getItem(`library-progress-v2-owner-${book.id}`));
        if (adminSaved) {
          map[book.id] = adminSaved;
        }
      } else {
        const guestSaved = parseStoredProgress(
          localStorage.getItem(`library-progress-v2-guest-${book.id}`),
        );
        if (guestSaved) {
          map[book.id] = guestSaved;
          continue;
        }
        const legacy = localStorage.getItem(`library-progress-${book.id}`);
        if (legacy !== null && /^\d+$/.test(legacy)) {
          const unit = Number(legacy);
          if (unit > 0) {
            const percent =
              book.total_units > 0 ? Math.min(100, ((unit + 1) / book.total_units) * 100) : 0;
            map[book.id] = { unit, offset: 0, percent, location: "" };
          }
        }
      }
    }
  } catch {
    // Private browsing or blocked storage: fall back gracefully.
  }
  return map;
}

export default function LibraryShelfClient({
  books,
  isAdmin,
  pageTitle,
}: {
  books: LibraryBookView[];
  isAdmin: boolean;
  pageTitle: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusFilter = parseStatusFilter(searchParams.get("status"));
  const formatFilter = parseFormatFilter(searchParams.get("format"));
  const rawCategory = searchParams.get("category")?.trim() ?? "";
  const categoryFilter = rawCategory || "all";
  const sortKey = parseSortKey(searchParams.get("sort"));
  const viewMode = parseViewMode(searchParams.get("view"));
  const urlQuery = searchParams.get("q") ?? "";

  const [draftQuery, setDraftQuery] = useState<string | null>(null);
  const query = draftQuery ?? urlQuery;

  const [localProgress, setLocalProgress] = useState<Record<number, StoredProgress>>({});
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<LibraryBookView | null>(null);
  const [adminBanner, setAdminBanner] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setLocalProgress(readBrowserProgressMap(books, isAdmin));
    const frame = requestAnimationFrame(sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, [books, isAdmin]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  function buildHref(
    patch: Partial<{
      status: StatusFilter;
      format: FormatFilter;
      category: string;
      q: string;
      sort: SortKey;
      view: ViewMode;
    }>,
  ): string {
    const params = new URLSearchParams(searchParams.toString());
    const nextStatus = patch.status ?? statusFilter;
    const nextFormat = patch.format ?? formatFilter;
    const nextCategory = patch.category !== undefined ? patch.category : categoryFilter;
    const nextQ = patch.q !== undefined ? patch.q : query;
    const nextSort = patch.sort ?? sortKey;
    const nextView = patch.view ?? viewMode;

    if (nextStatus !== "all") params.set("status", nextStatus);
    else params.delete("status");

    if (nextFormat !== "all") params.set("format", nextFormat);
    else params.delete("format");

    if (nextCategory && nextCategory !== "all") params.set("category", nextCategory);
    else params.delete("category");

    const trimmedQ = nextQ.trim();
    if (trimmedQ) params.set("q", trimmedQ);
    else params.delete("q");

    if (nextSort !== "updated") params.set("sort", nextSort);
    else params.delete("sort");

    if (nextView !== "grid") params.set("view", nextView);
    else params.delete("view");

    const serialized = params.toString();
    return serialized ? `${pathname}?${serialized}` : pathname;
  }

  function pushParams(
    patch: Partial<{
      status: StatusFilter;
      format: FormatFilter;
      category: string;
      q: string;
      sort: SortKey;
      view: ViewMode;
    }>,
  ) {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (patch.q !== undefined) setDraftQuery(null);
    router.push(buildHref(patch), { scroll: false });
  }

  function handleQueryChange(value: string) {
    setDraftQuery(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const serialized = params.toString();
      router.replace(serialized ? `${pathname}?${serialized}` : pathname, { scroll: false });
      setDraftQuery(null);
    }, 260);
  }

  function resetAllFilters() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setDraftQuery(null);
    const params = new URLSearchParams();
    if (viewMode !== "grid") params.set("view", viewMode);
    const serialized = params.toString();
    router.push(serialized ? `${pathname}?${serialized}` : pathname, { scroll: false });
  }

  function toggleNote(bookId: number) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }

  const enrichedBooks = useMemo(() => {
    return books.map((book) => {
      const browserProg = localProgress[book.id] ?? null;
      const serverProg: StoredProgress | null = book.progress
        ? {
            unit: book.progress.unit,
            offset: book.progress.offset,
            percent: book.progress.percent,
            location: book.progress.location,
          }
        : null;
      // Browser progress is written on every page turn; fall back to server progress on new devices.
      const effectiveProgress: StoredProgress | null = browserProg ?? serverProg;
      const percent = effectiveProgress ? Math.min(100, Math.max(0, effectiveProgress.percent)) : 0;
      const hasStarted = Boolean(
        effectiveProgress && (percent > 0 || effectiveProgress.unit > 0 || effectiveProgress.location),
      );
      return {
        book,
        effectiveProgress,
        percent,
        hasStarted,
      };
    });
  }, [books, localProgress]);

  const stats = useMemo(() => {
    let totalBytes = 0;
    let readingCount = 0;
    let doneCount = 0;
    let ratedSum = 0;
    let ratedCount = 0;
    const statusCounts: Record<BookStatus, number> = {
      reading: 0,
      unread: 0,
      done: 0,
      dropped: 0,
    };

    for (const { book, percent, hasStarted } of enrichedBooks) {
      totalBytes += book.bytes || 0;
      statusCounts[book.status] = (statusCounts[book.status] ?? 0) + 1;

      if (book.status === "done" || percent >= 100) {
        doneCount += 1;
      } else if (book.status === "reading" || (hasStarted && percent < 100)) {
        readingCount += 1;
      }

      if (book.rating > 0) {
        ratedSum += book.rating;
        ratedCount += 1;
      }
    }

    return {
      total: books.length,
      totalBytes,
      readingCount,
      doneCount,
      avgRating: ratedCount > 0 ? (ratedSum / ratedCount).toFixed(1) : null,
      ratedCount,
      statusCounts,
      hasCbz: books.some((b) => b.format === "cbz"),
    };
  }, [books, enrichedBooks]);

  const resumeCandidates = useMemo(() => {
    return enrichedBooks
      .filter(
        (entry) =>
          entry.book.format !== "cbz" &&
          entry.hasStarted &&
          entry.percent < 100,
      )
      .sort((a, b) => {
        const aLocal = a.effectiveProgress?.updatedAt ?? 0;
        const bLocal = b.effectiveProgress?.updatedAt ?? 0;
        if (bLocal !== aLocal) return bLocal - aLocal;
        if (b.percent !== a.percent) return b.percent - a.percent;
        return Date.parse(b.book.updated_at) - Date.parse(a.book.updated_at);
      });
  }, [enrichedBooks]);

  const categoryPills = useMemo(() => {
    const counts = new Map<string, number>();
    let uncategorizedCount = 0;

    for (const book of books) {
      const cat = book.category.trim();
      if (!cat) {
        uncategorizedCount += 1;
      } else {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }

    const presetOrder = new Map<string, number>(
      BOOK_CATEGORIES.map((cat, index) => [cat, index]),
    );
    const namedCategories = Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const aOrder = presetOrder.get(a[0]);
      const bOrder = presetOrder.get(b[0]);
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return a[0].localeCompare(b[0], "zh-CN");
    });

    const items: Array<{ key: string; label: string; count: number }> = [
      { key: "all", label: "全部分类", count: books.length },
      ...namedCategories.map(([cat, count]) => ({ key: cat, label: cat, count })),
    ];
    if (uncategorizedCount > 0 && namedCategories.length > 0) {
      items.push({ key: UNCATEGORIZED_KEY, label: "未分类", count: uncategorizedCount });
    }
    return items;
  }, [books]);

  const filteredBooks = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const list = enrichedBooks.filter(({ book, hasStarted, percent }) => {
      if (statusFilter !== "all") {
        // Let visitors filter "在读" / "读完" intuitively using either shelf status or their local progress!
        if (statusFilter === "reading") {
          const matchesReading = book.status === "reading" || (hasStarted && percent > 0 && percent < 100);
          if (!matchesReading) return false;
        } else if (statusFilter === "done") {
          const matchesDone = book.status === "done" || percent >= 100;
          if (!matchesDone) return false;
        } else if (book.status !== statusFilter) {
          return false;
        }
      }
      if (formatFilter !== "all" && book.format !== formatFilter) return false;
      if (categoryFilter === UNCATEGORIZED_KEY) {
        if (book.category.trim() !== "") return false;
      } else if (categoryFilter !== "all") {
        if (book.category.trim() !== categoryFilter) return false;
      }
      if (keyword) {
        const haystack = `${book.title}\n${book.author}\n${book.category}\n${book.note}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortKey === "progress") {
        if (b.percent !== a.percent) return b.percent - a.percent;
        return Date.parse(b.book.updated_at) - Date.parse(a.book.updated_at);
      }
      if (sortKey === "rating") {
        if (b.book.rating !== a.book.rating) return b.book.rating - a.book.rating;
        return Date.parse(b.book.updated_at) - Date.parse(a.book.updated_at);
      }
      if (sortKey === "title") {
        return a.book.title.localeCompare(b.book.title, "zh-CN");
      }
      return Date.parse(b.book.updated_at) - Date.parse(a.book.updated_at);
    });

    return list;
  }, [enrichedBooks, statusFilter, formatFilter, categoryFilter, query, sortKey]);

  const statusTabs: Array<FilterTabItem<StatusFilter>> = [
    { key: "all", label: `全部 ${stats.total}` },
    { key: "reading", label: `在读 ${stats.readingCount}` },
    { key: "unread", label: `未读 ${stats.statusCounts.unread}` },
    { key: "done", label: `读完 ${stats.doneCount}` },
    { key: "dropped", label: `搁置 ${stats.statusCounts.dropped}` },
  ];

  const formatOptions: Array<{ key: FormatFilter; label: string }> = [
    { key: "all", label: "全部格式" },
    { key: "epub", label: "EPUB" },
    { key: "txt", label: "TXT" },
    ...(stats.hasCbz ? [{ key: "cbz" as const, label: "CBZ" }] : []),
  ];

  const primaryResume = resumeCandidates[0] ?? null;
  const secondaryResumes = resumeCandidates.slice(1, 3);
  const hasActiveFilters =
    statusFilter !== "all" ||
    formatFilter !== "all" ||
    categoryFilter !== "all" ||
    query.trim() !== "";

  function handleAdminSuccess(nextMessage: string) {
    setAdminBanner(nextMessage);
    setUploadOpen(false);
    setEditingBook(null);
    router.refresh();
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
            <BookOpen className="h-6 w-6 text-sky-500 md:h-7 md:w-7" />
            {pageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            共 {books.length} 本藏书 · 支持 EPUB 与 TXT 沉浸阅读 · 自动记忆本机进度
            {isAdmin ? "（管理员云端同步已开启）" : ""}
          </p>
        </div>

        {isAdmin ? (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            <Plus className="h-4 w-4" />
            上传新书
          </button>
        ) : null}
      </div>

      {isAdmin && adminBanner ? (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/50 bg-emerald-50/90 px-4 py-2.5 text-xs font-medium text-emerald-800 backdrop-blur-md dark:border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-200"
        >
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {adminBanner}
          </span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setAdminBanner(null)}
            className="rounded-full p-1 text-emerald-700 hover:bg-emerald-200/50 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-emerald-300 dark:hover:bg-emerald-800/50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {books.length === 0 ? (
        <GlassPanel
          as="div"
          tone="soft"
          padding="lg"
          className="text-center text-sm text-slate-500 dark:text-slate-400"
        >
          {isAdmin ? (
            <div className="space-y-3">
              <p>书架还是空的，点击下方按钮即可直接上传 EPUB / TXT 并设置分类与封面。</p>
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
              >
                <Plus className="h-4 w-4" />
                上传新书
              </button>
            </div>
          ) : (
            "书架还是空的。登录后台「书架」上传 EPUB / TXT 即可开始在线阅读。"
          )}
        </GlassPanel>
      ) : (
        <>
          {/* 阅读统计概览栏 */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <GlassPanel padding="sm" className="bg-white/55 px-4 py-3 dark:bg-slate-800/55">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>总藏书</span>
                <BookOpen className="h-3.5 w-3.5 text-sky-500" />
              </div>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-800 dark:text-white">
                {stats.total} <span className="text-xs font-normal text-slate-500">本</span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                馆藏体积 {formatBytes(stats.totalBytes)}
              </p>
            </GlassPanel>

            <GlassPanel padding="sm" className="bg-white/55 px-4 py-3 dark:bg-slate-800/55">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>在读</span>
                <BookMarked className="h-3.5 w-3.5 text-sky-500" />
              </div>
              <p className="mt-1 text-xl font-bold tabular-nums text-sky-600 dark:text-sky-400">
                {stats.readingCount} <span className="text-xs font-normal text-slate-500">本</span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {resumeCandidates.length > 0 ? `${resumeCandidates.length} 本有阅读记录` : "随时翻开一章"}
              </p>
            </GlassPanel>

            <GlassPanel padding="sm" className="bg-white/55 px-4 py-3 dark:bg-slate-800/55">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>已读完</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-800 dark:text-white">
                {stats.doneCount} <span className="text-xs font-normal text-slate-500">本</span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                完读率 {Math.round((stats.doneCount / Math.max(1, stats.total)) * 100)}%
              </p>
            </GlassPanel>

            <GlassPanel padding="sm" className="bg-white/55 px-4 py-3 dark:bg-slate-800/55">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>平均评分</span>
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              </div>
              {stats.avgRating ? (
                <>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-xl font-bold tabular-nums text-slate-800 dark:text-white">
                      {stats.avgRating}
                    </span>
                    <RatingStars value={Number(stats.avgRating)} size="sm" />
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">{stats.ratedCount} 本已评分</p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xl font-bold text-slate-400">—</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">暂无评分记录</p>
                </>
              )}
            </GlassPanel>
          </div>

          {/* 继续上次阅读 Spotlight Card */}
          {primaryResume ? (
            <GlassPanel
              padding="md"
              className="mb-6 border-sky-400/40 bg-white/65 shadow-sm dark:border-sky-500/30 dark:bg-slate-800/70"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3.5">
                  <Link
                    href={`/library/${primaryResume.book.id}`}
                    className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-200/70 shadow-sm ring-1 ring-black/5 transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:bg-slate-700/70 dark:ring-white/10"
                  >
                    {primaryResume.book.cover ? (
                      <img
                        src={primaryResume.book.cover}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-xl">📖</div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
                        <Sparkles className="h-3 w-3" />
                        继续上次阅读
                      </span>
                      {primaryResume.book.category ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/35 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/15 dark:text-sky-300">
                          <Tag className="h-2.5 w-2.5" />
                          {primaryResume.book.category}
                        </span>
                      ) : null}
                      <span className="text-[11px] uppercase tracking-wider text-slate-400">
                        {primaryResume.book.format} · {formatBytes(primaryResume.book.bytes)}
                      </span>
                    </div>
                    <Link
                      href={`/library/${primaryResume.book.id}`}
                      className="mt-1 block line-clamp-1 text-base font-semibold text-slate-800 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-100 dark:hover:text-sky-400"
                    >
                      {primaryResume.book.title}
                    </Link>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {primaryResume.book.author || "佚名"}
                    </p>
                    <div className="mt-2 flex max-w-xs items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                        <div
                          className="h-full rounded-full bg-sky-500 transition-all"
                          style={{ width: `${Math.max(3, primaryResume.percent)}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-sky-600 dark:text-sky-400">
                        已读 {primaryResume.percent.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:self-center">
                  <Link
                    href={`/library/${primaryResume.book.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                  >
                    继续阅读
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              {secondaryResumes.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-2.5 text-xs dark:border-white/10">
                  <span className="text-slate-400">也在阅读：</span>
                  {secondaryResumes.map(({ book, percent }) => (
                    <Link
                      key={book.id}
                      href={`/library/${book.id}`}
                      className="inline-flex max-w-56 items-center gap-1.5 truncate rounded-full border border-white/50 bg-white/60 px-2.5 py-1 text-slate-700 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:text-sky-300"
                    >
                      <span className="truncate">{book.title}</span>
                      <span className="shrink-0 tabular-nums text-[11px] text-sky-600 dark:text-sky-400">
                        {percent.toFixed(0)}%
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </GlassPanel>
          ) : null}

          {/* Toolbar: Status Tabs + Format Pills + Search + Sort + View Toggle */}
          <GlassPanel padding="sm" className="mb-5 space-y-3 bg-white/50 p-3.5 dark:bg-slate-800/50">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <FilterTabs
                items={statusTabs}
                value={statusFilter}
                onChange={(next) => pushParams({ status: next })}
                aria-label="阅读状态筛选"
                inactiveClassName="bg-white/50 dark:bg-slate-900/40"
              />

              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="书籍格式筛选">
                {formatOptions.map((opt) => {
                  const active = formatFilter === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => pushParams({ format: opt.key })}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 ${
                        active
                          ? "border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                          : "border-white/40 bg-white/40 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  maxLength={100}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  placeholder="搜索书名、作者、分类、书评笔记…"
                  aria-label="搜索书架"
                  className="h-9 w-full rounded-full border border-white/50 bg-white/75 pl-9 pr-9 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="清空搜索词"
                    onClick={() => {
                      pushParams({ q: "" });
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-500 hover:bg-slate-200/60 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300 dark:hover:bg-slate-700/60"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  显示 {filteredBooks.length} / {books.length} 本
                </span>

                <select
                  aria-label="排序方式"
                  value={sortKey}
                  onChange={(event) => pushParams({ sort: parseSortKey(event.target.value) })}
                  className="h-9 rounded-full border border-white/50 bg-white/75 px-3 text-xs font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200"
                >
                  <option value="updated">排序：最近更新</option>
                  <option value="progress">排序：阅读进度</option>
                  <option value="rating">排序：评分最高</option>
                  <option value="title">排序：书名 A-Z</option>
                </select>

                <div
                  role="group"
                  aria-label="视图切换"
                  className="inline-flex rounded-full border border-white/50 bg-white/60 p-0.5 dark:border-white/10 dark:bg-slate-900/60"
                >
                  <button
                    type="button"
                    aria-pressed={viewMode === "grid"}
                    aria-label="书封网格视图"
                    title="书封网格"
                    onClick={() => pushParams({ view: "grid" })}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                      viewMode === "grid"
                        ? "bg-sky-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">网格</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={viewMode === "list"}
                    aria-label="详情列表视图"
                    title="详情列表"
                    onClick={() => pushParams({ view: "list" })}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                      viewMode === "list"
                        ? "bg-sky-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">列表</span>
                  </button>
                </div>
              </div>
            </div>
          </GlassPanel>

          {/* 图书分类胶囊栏 */}
          <div
            role="group"
            aria-label="图书分类筛选"
            className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/40 bg-white/45 px-3.5 py-2.5 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
          >
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Tag className="h-3.5 w-3.5 text-sky-500" />
              分类
            </span>
            {categoryPills.map((item) => {
              const active = categoryFilter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pushParams({ category: item.key })}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 ${
                    active
                      ? "border-sky-500 bg-sky-600 text-white shadow-xs dark:border-sky-400 dark:bg-sky-500"
                      : "border-white/50 bg-white/60 text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:text-sky-300"
                  }`}
                >
                  <span>{item.label}</span>
                  <span
                    className={`tabular-nums text-[11px] ${
                      active ? "text-white/85" : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    ({item.count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Results */}
          {filteredBooks.length === 0 ? (
            <AsyncState
              tone="empty"
              title="没有找到匹配的书籍"
              description="当前筛选或搜索条件下没有匹配的藏书，可以清空条件查看全部。"
              actionLabel={hasActiveFilters ? "重置筛选" : undefined}
              onAction={hasActiveFilters ? resetAllFilters : undefined}
              compact
            />
          ) : viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredBooks.map(({ book, percent, hasStarted }) => {
                const isCbz = book.format === "cbz";
                const noteExpanded = expandedNotes.has(book.id);
                const hasLongNote = book.note.length > 56 || book.note.includes("\n");

                return (
                  <GlassPanel
                    key={book.id}
                    as="article"
                    padding="md"
                    className={`flex flex-col justify-between bg-white/55 transition-all dark:bg-slate-800/55 ${
                      isCbz ? "opacity-90" : "hover:-translate-y-0.5 hover:shadow-lg"
                    }`}
                  >
                    <div>
                      <div className="flex gap-3.5">
                        {isCbz ? (
                          <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-200/70 shadow-xs dark:bg-slate-700/70">
                            {book.cover ? (
                              <img src={book.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-xl">🗂️</div>
                            )}
                          </div>
                        ) : (
                          <Link
                            href={`/library/${book.id}`}
                            aria-label={`阅读《${book.title}》`}
                            className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-200/70 shadow-xs ring-1 ring-black/5 transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:bg-slate-700/70 dark:ring-white/10"
                          >
                            {book.cover ? (
                              <img src={book.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-xl">📖</div>
                            )}
                          </Link>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                STATUS_BADGE_CLASS[book.status] ?? STATUS_BADGE_CLASS.unread
                              }`}
                            >
                              {STATUS_LABEL[book.status] ?? book.status}
                            </span>
                            {book.category ? (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-sky-400/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/15 dark:text-sky-300">
                                <Tag className="h-2.5 w-2.5" />
                                {book.category}
                              </span>
                            ) : null}
                            <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600 dark:bg-slate-400/10 dark:text-slate-300">
                              {book.format}
                            </span>
                            <span className="text-[11px] text-slate-400">{formatBytes(book.bytes)}</span>
                          </div>

                          <h2 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100">
                            {isCbz ? (
                              <span>{book.title}</span>
                            ) : (
                              <Link
                                href={`/library/${book.id}`}
                                className="hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-sky-400"
                              >
                                {book.title}
                              </Link>
                            )}
                          </h2>

                          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                            {book.author || "佚名"}
                          </p>

                          {book.rating > 0 ? (
                            <div className="mt-1 flex items-center gap-1">
                              <RatingStars value={book.rating} size="sm" />
                              <span className="text-[11px] tabular-nums text-slate-400">
                                {book.rating}/5
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {book.note ? (
                        <div className="mt-3 rounded-xl bg-white/45 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                          <p className={noteExpanded ? "whitespace-pre-wrap break-words leading-relaxed" : "line-clamp-2 leading-relaxed"}>
                            {book.note}
                          </p>
                          {hasLongNote ? (
                            <button
                              type="button"
                              onClick={() => toggleNote(book.id)}
                              aria-expanded={noteExpanded}
                              className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-sky-600 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400"
                            >
                              {noteExpanded ? (
                                <>
                                  收起书评 <ChevronUp className="h-3 w-3" />
                                </>
                              ) : (
                                <>
                                  展开书评 <ChevronDown className="h-3 w-3" />
                                </>
                              )}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 border-t border-white/40 pt-2.5 dark:border-white/10">
                      {isCbz ? (
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                            暂不支持在线预览
                          </span>
                          {book.file_url ? (
                            <a
                              href={book.file_url}
                              download
                              className="inline-flex items-center gap-1 text-sky-600 hover:underline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400"
                            >
                              <Download className="h-3 w-3" />
                              下载原文件
                            </a>
                          ) : null}
                        </div>
                      ) : hasStarted ? (
                        <div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-sky-600 dark:text-sky-400">
                              读到 {percent.toFixed(0)}%
                            </span>
                            <Link
                              href={`/library/${book.id}`}
                              className="inline-flex items-center gap-0.5 font-medium text-slate-600 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300 dark:hover:text-sky-400"
                            >
                              继续阅读 <ArrowRight className="h-3 w-3" />
                            </Link>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                            <div
                              className="h-full rounded-full bg-sky-500 transition-all"
                              style={{ width: `${Math.max(3, percent)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>尚未开始阅读</span>
                          <Link
                            href={`/library/${book.id}`}
                            className="inline-flex items-center gap-0.5 font-medium text-sky-600 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400"
                          >
                            开始阅读 <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      )}

                      {isAdmin ? (
                        <div className="mt-2.5 flex justify-end border-t border-white/30 pt-2 dark:border-white/10">
                          <button
                            type="button"
                            onClick={() => setEditingBook(book)}
                            className="inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:text-sky-300"
                          >
                            <Pencil className="h-3 w-3" />
                            编辑 / 分类
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </GlassPanel>
                );
              })}
            </div>
          ) : (
            /* 详情列表视图 */
            <GlassPanel className="divide-y divide-white/40 overflow-hidden bg-white/55 dark:divide-white/10 dark:bg-slate-800/55">
              {filteredBooks.map(({ book, percent, hasStarted }) => {
                const isCbz = book.format === "cbz";
                const noteExpanded = expandedNotes.has(book.id);

                return (
                  <article
                    key={book.id}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-white/30 sm:flex-row sm:items-start sm:justify-between dark:hover:bg-white/5"
                  >
                    <div className="flex min-w-0 flex-1 gap-3.5">
                      <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-200/70 shadow-xs dark:bg-slate-700/70">
                        {book.cover ? (
                          <img src={book.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-lg">
                            {isCbz ? "🗂️" : "📖"}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              STATUS_BADGE_CLASS[book.status] ?? STATUS_BADGE_CLASS.unread
                            }`}
                          >
                            {STATUS_LABEL[book.status] ?? book.status}
                          </span>
                          {book.category ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/35 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/15 dark:text-sky-300">
                              <Tag className="h-3 w-3" />
                              {book.category}
                            </span>
                          ) : null}
                          <span className="inline-flex items-center gap-1 rounded bg-slate-500/10 px-1.5 py-0.5 text-[11px] font-medium uppercase text-slate-600 dark:bg-slate-400/10 dark:text-slate-300">
                            <FileText className="h-3 w-3" />
                            {book.format}
                          </span>
                          <span className="text-xs text-slate-400">{formatBytes(book.bytes)}</span>
                          {book.total_units > 0 ? (
                            <span className="text-xs text-slate-400">· 共 {book.total_units} 节/章</span>
                          ) : null}
                          <span className="text-xs text-slate-400">· 更新于 {formatDate(book.updated_at)}</span>
                        </div>

                        <h2 className="mt-1 line-clamp-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                          {isCbz ? (
                            book.title
                          ) : (
                            <Link
                              href={`/library/${book.id}`}
                              className="hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-sky-400"
                            >
                              {book.title}
                            </Link>
                          )}
                        </h2>

                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>{book.author || "佚名"}</span>
                          {book.rating > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              · <RatingStars value={book.rating} size="sm" />
                              <span className="tabular-nums">{book.rating}/5</span>
                            </span>
                          ) : null}
                        </div>

                        {book.note ? (
                          <div className="mt-2">
                            <p
                              className={`text-xs leading-relaxed text-slate-600 dark:text-slate-300 ${
                                noteExpanded ? "whitespace-pre-wrap break-words" : "line-clamp-2"
                              }`}
                            >
                              {book.note}
                            </p>
                            {book.note.length > 80 || book.note.includes("\n") ? (
                              <button
                                type="button"
                                onClick={() => toggleNote(book.id)}
                                aria-expanded={noteExpanded}
                                className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-sky-600 hover:underline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400"
                              >
                                {noteExpanded ? "收起书评" : "展开完整书评"}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:w-44 sm:flex-col sm:items-end sm:justify-center">
                      {isCbz ? (
                        <>
                          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                            暂不支持在线预览
                          </span>
                          {book.file_url ? (
                            <a
                              href={book.file_url}
                              download
                              className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400"
                            >
                              <Download className="h-3.5 w-3.5" />
                              下载文件
                            </a>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="w-28 sm:w-full">
                            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                              <span>{hasStarted ? "阅读进度" : "未开始"}</span>
                              {hasStarted ? (
                                <span className="font-semibold tabular-nums text-sky-600 dark:text-sky-400">
                                  {percent.toFixed(0)}%
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                              <div
                                className="h-full rounded-full bg-sky-500 transition-all"
                                style={{ width: `${hasStarted ? Math.max(3, percent) : 0}%` }}
                              />
                            </div>
                          </div>
                          <Link
                            href={`/library/${book.id}`}
                            className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                          >
                            {hasStarted ? "继续阅读" : "开始阅读"}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </>
                      )}

                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => setEditingBook(book)}
                          className="inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/60 px-3 py-1 text-[11px] font-medium text-slate-600 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:text-sky-300"
                        >
                          <Pencil className="h-3 w-3" />
                          编辑 / 分类
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </GlassPanel>
          )}
        </>
      )}

      {isAdmin && uploadOpen ? (
        <UploadBookModal
          onClose={() => setUploadOpen(false)}
          onSuccess={handleAdminSuccess}
        />
      ) : null}

      {isAdmin && editingBook ? (
        <EditBookModal
          key={editingBook.id}
          book={editingBook}
          onClose={() => setEditingBook(null)}
          onSuccess={handleAdminSuccess}
        />
      ) : null}
    </div>
  );
}
