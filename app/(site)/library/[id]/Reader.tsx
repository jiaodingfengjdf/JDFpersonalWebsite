"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  List,
  LoaderCircle,
  Minus,
  Palette,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import type { Book, Location, NavItem, Rendition } from "epubjs";
import AsyncState from "@/components/site/AsyncState";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import type { BookStatus, LibraryBookView } from "@/server/modules/library/contracts";
import { splitChapters } from "@/lib/library-chapters";
import { CategoryPicker, LIBRARY_STATUS_OPTIONS, StarRatingPicker } from "../BookAdminModals";

type Progress = NonNullable<LibraryBookView["progress"]>;
const EMPTY_PROGRESS: Progress = { unit: 0, offset: 0, percent: 0, location: "" };

interface TocEntry {
  href: string;
  label: string;
  depth: number;
}

type ReaderThemeKey = "site" | "sepia" | "night" | "paper";

interface ReaderThemeSpec {
  key: ReaderThemeKey;
  label: string;
  swatch: string;
  surfaceClass: string;
  epubLight: { bg: string; fg: string; link: string };
  epubDark: { bg: string; fg: string; link: string };
}

const THEMES: ReaderThemeSpec[] = [
  {
    key: "site",
    label: "跟随站点",
    swatch: "bg-gradient-to-br from-white to-slate-800 border-slate-300",
    surfaceClass:
      "border-white/55 bg-white/90 text-slate-800 dark:border-white/10 dark:bg-slate-900/90 dark:text-slate-100",
    epubLight: { bg: "#ffffff", fg: "#1e293b", link: "#0284c7" },
    epubDark: { bg: "#0f172a", fg: "#e2e8f0", link: "#38bdf8" },
  },
  {
    key: "sepia",
    label: "羊皮纸护眼",
    swatch: "bg-[#f6efe2] border-[#d8c7a8]",
    surfaceClass: "border-[#e4d5b7] bg-[#f6efe2] text-[#3b2f2f]",
    epubLight: { bg: "#f6efe2", fg: "#3b2f2f", link: "#0369a1" },
    epubDark: { bg: "#f6efe2", fg: "#3b2f2f", link: "#0369a1" },
  },
  {
    key: "night",
    label: "静谧夜间",
    swatch: "bg-[#111827] border-slate-600",
    surfaceClass: "border-slate-700/80 bg-[#111827] text-slate-200",
    epubLight: { bg: "#111827", fg: "#cbd5e1", link: "#38bdf8" },
    epubDark: { bg: "#111827", fg: "#cbd5e1", link: "#38bdf8" },
  },
  {
    key: "paper",
    label: "纯白纸张",
    swatch: "bg-white border-slate-300",
    surfaceClass: "border-slate-200 bg-white text-slate-900",
    epubLight: { bg: "#ffffff", fg: "#1e293b", link: "#0284c7" },
    epubDark: { bg: "#ffffff", fg: "#1e293b", link: "#0284c7" },
  },
];

const FONT_KEY = "library-reader-font-size";
const THEME_KEY = "library-reader-theme";
const DEFAULT_FONT_SIZE = 18;
const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 28;
const FONT_STEP = 2;
/** Server writes are throttled; local storage is always written immediately. */
const SERVER_FLUSH_MS = 5_000;

function parseTheme(raw: string | null): ReaderThemeKey {
  if (raw === "site" || raw === "sepia" || raw === "night" || raw === "paper") return raw;
  return "site";
}

function readStoredProgress(
  keys: string[],
  fallback: Progress | null,
  allowLegacy: boolean,
): Progress {
  try {
    for (const key of keys) {
      const saved = localStorage.getItem(key);
      if (!saved) continue;
      const parsed = JSON.parse(saved) as Partial<Progress>;
      if (
        typeof parsed.unit === "number" &&
        Number.isSafeInteger(parsed.unit) &&
        parsed.unit >= 0 &&
        typeof parsed.location === "string"
      ) {
        const offset =
          typeof parsed.offset === "number" && Number.isFinite(parsed.offset)
            ? Math.min(1, Math.max(0, parsed.offset))
            : 0;
        const percent =
          typeof parsed.percent === "number" && Number.isFinite(parsed.percent)
            ? Math.min(100, Math.max(0, parsed.percent))
            : 0;
        return { unit: parsed.unit, offset, percent, location: parsed.location };
      }
    }
    if (allowLegacy && keys[0]) {
      const legacy = localStorage.getItem(keys[0].replace(/-v2-(?:admin|owner|guest)-/, "-"));
      if (legacy !== null && /^\d+$/.test(legacy)) {
        return { ...EMPTY_PROGRESS, unit: Number(legacy) };
      }
    }
  } catch {
    // Storage may be unavailable in private browsing.
  }
  return fallback ?? EMPTY_PROGRESS;
}

function flattenNav(items: NavItem[], depth = 0): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const item of items) {
    if (!item || typeof item.href !== "string" || !item.href) continue;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    entries.push({ href: item.href, label: label || "章节", depth });
    if (Array.isArray(item.subitems) && item.subitems.length) {
      entries.push(...flattenNav(item.subitems, depth + 1));
    }
  }
  return entries.slice(0, 1000);
}

function normalizeHref(href: string): string {
  return href.split("#")[0]?.replace(/^\.\//, "").trim() ?? "";
}

interface BookMetaState {
  category: string;
  status: BookStatus;
  rating: number;
  note: string;
}

function QuickManageBookModal({
  book,
  meta,
  onClose,
  onSaved,
}: {
  book: LibraryBookView;
  meta: BookMetaState;
  onClose: () => void;
  onSaved: (next: BookMetaState) => void;
}) {
  const [category, setCategory] = useState(meta.category);
  const [status, setStatus] = useState<BookStatus>(meta.status);
  const [rating, setRating] = useState(meta.rating);
  const [note, setNote] = useState(meta.note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const nextMeta: BookMetaState = {
      category: category.trim(),
      status,
      rating,
      note: note.trim(),
    };
    try {
      await siteAdminRequest(`/api/admin/library/${book.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: book.title,
          author: book.author,
          category: nextMeta.category,
          status: nextMeta.status,
          rating: nextMeta.rating,
          note: nextMeta.note,
          cover: book.cover,
        }),
      });
      onSaved(nextMeta);
    } catch (reason) {
      setError(describeSiteAdminError(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-xs"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-manage-book-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/95"
      >
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3.5 dark:border-white/10">
          <div className="min-w-0">
            <h2
              id="reader-manage-book-title"
              className="line-clamp-1 text-sm font-semibold text-slate-800 dark:text-white"
            >
              管理本书 · 《{book.title}》
            </h2>
            <p className="text-[11px] text-slate-400">修改分类、状态、评分或笔记不会影响当前阅读位置</p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="关闭管理弹窗"
            className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex-1 space-y-4 overflow-y-auto p-5">
          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-300/70 bg-rose-50/90 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/60 dark:text-rose-200"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label
              htmlFor="reader-manage-category"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              图书分类
            </label>
            <CategoryPicker
              inputId="reader-manage-category"
              value={category}
              onChange={setCategory}
              disabled={saving}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="reader-manage-status"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                阅读状态
              </label>
              <select
                id="reader-manage-status"
                disabled={saving}
                value={status}
                onChange={(event) => setStatus(event.target.value as BookStatus)}
                className="h-9 w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
              >
                {LIBRARY_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                个人评分
              </span>
              <StarRatingPicker value={rating} onChange={setRating} disabled={saving} />
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="reader-manage-note"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              阅读笔记 / 书评
            </label>
            <textarea
              id="reader-manage-note"
              rows={3}
              maxLength={2000}
              disabled={saving}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="随时记下读书笔记…"
              className="w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200/70 pt-3 dark:border-white/10">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-60"
            >
              {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Reader({
  book,
  canPersist,
  isAdmin = canPersist,
}: {
  book: LibraryBookView;
  canPersist: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [chapters, setChapters] = useState<string[]>([]);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [currentHref, setCurrentHref] = useState("");
  const [total, setTotal] = useState(1);
  const [boundaries, setBoundaries] = useState({ start: true, end: true });
  const [loading, setLoading] = useState(book.format !== "cbz");
  const [turning, setTurning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocQuery, setTocQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [bookMeta, setBookMeta] = useState<BookMetaState>({
    category: book.category,
    status: book.status,
    rating: book.rating,
    note: book.note,
  });
  const initialServerProgressRef = useRef(book.progress);
  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_FONT_SIZE;
    try {
      const value = Number(localStorage.getItem(FONT_KEY));
      if (Number.isFinite(value) && value >= MIN_FONT_SIZE && value <= MAX_FONT_SIZE) return value;
    } catch {
      // Storage may be unavailable.
    }
    return DEFAULT_FONT_SIZE;
  });
  const [themeKey, setThemeKey] = useState<ReaderThemeKey>(() => {
    if (typeof window === "undefined") return "site";
    try {
      return parseTheme(localStorage.getItem(THEME_KEY));
    } catch {
      return "site";
    }
  });
  const [siteDark, setSiteDark] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const progressQueue = useRef<Promise<void>>(Promise.resolve());
  const latestProgress = useRef<Progress | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFlushAt = useRef(0);
  const textRef = useRef<HTMLElement>(null);
  const activeTocRef = useRef<HTMLButtonElement | null>(null);
  const fontSizeRef = useRef(fontSize);
  const themeSpecRef = useRef<{ bg: string; fg: string; link: string }>(THEMES[0].epubLight);

  const primaryProgressKey = `library-progress-v2-${canPersist ? "admin" : "guest"}-${book.id}`;
  const legacyOwnerKey = `library-progress-v2-owner-${book.id}`;

  const activeTheme = THEMES.find((item) => item.key === themeKey) ?? THEMES[0];
  const resolvedEpubColors = siteDark ? activeTheme.epubDark : activeTheme.epubLight;

  // Watch site root `.dark` class so "跟随站点" updates EPUB iframe colors live.
  useEffect(() => {
    const root = document.documentElement;
    const checkDark = () => setSiteDark(root.classList.contains("dark"));
    const frame = requestAnimationFrame(checkDark);
    const observer = new MutationObserver(checkDark);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const applyRenditionTheme = useCallback((colors: { bg: string; fg: string; link: string }) => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    rendition.themes.override("color", colors.fg);
    rendition.themes.override("background", colors.bg);
    rendition.themes.default({
      body: {
        padding: "0 12px",
        "line-height": "1.95",
        color: `${colors.fg} !important`,
        background: `${colors.bg} !important`,
      },
      a: {
        color: `${colors.link} !important`,
      },
    });
  }, []);

  useEffect(() => {
    themeSpecRef.current = resolvedEpubColors;
    applyRenditionTheme(resolvedEpubColors);
  }, [resolvedEpubColors, applyRenditionTheme]);

  /** Send the newest progress through the existing serial queue. */
  const flushProgress = useCallback(() => {
    if (flushTimer.current !== null) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    lastFlushAt.current = Date.now();
    const snapshot = latestProgress.current;
    if (!snapshot) return;
    progressQueue.current = progressQueue.current.then(async () => {
      if (latestProgress.current !== snapshot) return;
      try {
        const response = await fetch(`/api/admin/library/${book.id}/progress`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            unit: snapshot.unit,
            offset: snapshot.offset,
            percent: snapshot.percent,
            location: snapshot.location,
          }),
          keepalive: true,
          signal: AbortSignal.timeout(10_000),
        });
        setSyncFailed(!response.ok);
      } catch {
        setSyncFailed(true);
      }
    });
  }, [book.id]);

  const scheduleProgressFlush = useCallback(() => {
    if (flushTimer.current !== null) return;
    const remaining = Math.max(0, SERVER_FLUSH_MS - (Date.now() - lastFlushAt.current));
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      flushProgress();
    }, remaining);
  }, [flushProgress]);

  const saveProgress = useCallback(
    (next: Progress) => {
      const payload = JSON.stringify({ ...next, updatedAt: Date.now() });
      try {
        localStorage.setItem(primaryProgressKey, payload);
        if (canPersist) {
          localStorage.setItem(legacyOwnerKey, payload);
        }
      } catch {
        // The reader remains usable without local storage.
      }
      if (!canPersist) return;

      latestProgress.current = next;
      scheduleProgressFlush();
    },
    [canPersist, legacyOwnerKey, primaryProgressKey, scheduleProgressFlush],
  );

  // Final write on page turn / leaving, so the last position is never lost.
  useEffect(() => {
    const onPageHide = () => flushProgress();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushProgress();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      flushProgress();
    };
  }, [flushProgress]);

  useEffect(() => {
    fontSizeRef.current = fontSize;
    renditionRef.current?.themes.fontSize(`${fontSize}px`);
  }, [fontSize]);

  const changeFont = useCallback((delta: number) => {
    setFontSize((prev) => {
      const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, prev + delta));
      if (next !== prev) {
        try {
          localStorage.setItem(FONT_KEY, String(next));
        } catch {
          // Ignore storage failures.
        }
      }
      return next;
    });
  }, []);

  function selectTheme(next: ReaderThemeKey) {
    setThemeKey(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Ignore storage failures.
    }
  }

  useEffect(() => {
    if (book.format === "cbz") return;

    const controller = new AbortController();
    let epub: Book | undefined;
    const keys = canPersist ? [primaryProgressKey, legacyOwnerKey] : [primaryProgressKey];
    const start = readStoredProgress(
      keys,
      canPersist ? initialServerProgressRef.current : null,
      book.format === "txt",
    );

    async function boot() {
      try {
        if (book.format !== "epub" && book.format !== "txt") {
          throw new Error("此格式暂不支持在线阅读。");
        }
        const response = await fetch(book.file_url, { signal: controller.signal });
        if (!response.ok) throw new Error("书籍文件无法读取，请重试或重新上传。");

        if (book.format === "txt") {
          const parts = splitChapters(await response.text());
          if (!parts.length) throw new Error("这份 TXT 没有可阅读的内容。");
          if (controller.signal.aborted) return;
          const unit = Math.min(start.unit, parts.length - 1);
          setChapters(parts);
          setTotal(parts.length);
          setToc(
            parts.map((part, index) => ({
              href: String(index),
              label: (
                part
                  .split("\n")
                  .map((line) => line.trim())
                  .find(Boolean) ?? `第 ${index + 1} 章`
              ).slice(0, 80),
              depth: 0,
            })),
          );
          const initial = { ...EMPTY_PROGRESS, unit, percent: ((unit + 1) / parts.length) * 100 };
          setProgress(initial);
          setCurrentHref(String(unit));
        } else {
          const [{ default: openEpub }, bytes] = await Promise.all([
            import("epubjs"),
            response.arrayBuffer(),
          ]);
          if (controller.signal.aborted || !viewerRef.current) return;
          epub = openEpub();
          await epub.open(bytes, "binary");
          if (controller.signal.aborted) return;
          let sections = 0;
          epub.spine.each(() => {
            sections += 1;
          });
          if (!sections) throw new Error("EPUB 没有可阅读的章节。");
          setTotal(sections);

          const nav = await epub.loaded.navigation.catch(() => null);
          if (controller.signal.aborted) return;
          setToc(nav ? flattenNav(nav.toc) : []);

          const rendition = epub.renderTo(viewerRef.current, {
            width: "100%",
            height: "100%",
            flow: "paginated",
            spread: "none",
            allowScriptedContent: false,
          });
          renditionRef.current = rendition;
          applyRenditionTheme(themeSpecRef.current);
          rendition.themes.fontSize(`${fontSizeRef.current}px`);

          let initialLocation = true;
          rendition.on("relocated", (location: Location) => {
            if (controller.signal.aborted || !location.start) return;
            const { index, cfi, displayed, href } = location.start;
            const offset = displayed ? displayed.page / Math.max(1, displayed.total) : 1;
            const next = {
              unit: Math.max(0, index),
              offset: Math.min(1, Math.max(0, offset)),
              percent: location.atEnd ? 100 : Math.min(100, ((index + offset) / sections) * 100),
              location: typeof cfi === "string" && cfi.length <= 1024 ? cfi : "",
            };
            setBoundaries({ start: location.atStart, end: location.atEnd });
            setProgress(next);
            if (typeof href === "string") setCurrentHref(href);
            if (!initialLocation) saveProgress(next);
            initialLocation = false;
          });

          try {
            if (start.location) await rendition.display(start.location);
            else if (start.unit > 0 && start.unit < sections) await rendition.display(start.unit);
            else await rendition.display();
          } catch {
            await rendition.display();
          }
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "加载失败");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void boot();
    return () => {
      controller.abort();
      epub?.destroy();
      renditionRef.current = null;
    };
  }, [
    applyRenditionTheme,
    attempt,
    book.file_url,
    book.format,
    canPersist,
    legacyOwnerKey,
    primaryProgressKey,
    saveProgress,
  ]);

  const jumpToTxtChapter = useCallback(
    (unit: number) => {
      if (!Number.isSafeInteger(unit) || unit < 0 || unit >= total) return;
      const next = { ...EMPTY_PROGRESS, unit, percent: ((unit + 1) / total) * 100 };
      setProgress(next);
      setCurrentHref(String(unit));
      textRef.current?.scrollTo({ top: 0, behavior: "instant" });
      saveProgress(next);
      flushProgress();
    },
    [flushProgress, saveProgress, total],
  );

  async function jumpTo(entry: TocEntry) {
    setTocOpen(false);
    if (book.format === "txt") {
      jumpToTxtChapter(Number(entry.href));
      return;
    }
    if (loading || turning) return;
    setTurning(true);
    try {
      await renditionRef.current?.display(entry.href);
      flushProgress();
    } catch {
      setError("无法跳转到该章节。");
    } finally {
      setTurning(false);
    }
  }

  const go = useCallback(
    async (delta: -1 | 1) => {
      if (loading || turning || error) return;
      if (book.format === "txt") {
        const unit = Math.min(total - 1, Math.max(0, progress.unit + delta));
        if (unit === progress.unit) return;
        jumpToTxtChapter(unit);
        return;
      }

      if (delta < 0 && boundaries.start) return;
      if (delta > 0 && boundaries.end) return;

      setTurning(true);
      try {
        if (delta > 0) await renditionRef.current?.next();
        else await renditionRef.current?.prev();
        flushProgress();
      } catch {
        setError("无法翻页，请重新加载书籍。");
      } finally {
        setTurning(false);
      }
    },
    [
      book.format,
      boundaries.end,
      boundaries.start,
      error,
      flushProgress,
      jumpToTxtChapter,
      loading,
      progress.unit,
      total,
      turning,
    ],
  );

  // Keyboard shortcuts: Left/PageUp, Right/PageDown, t, Escape, +/-, ?
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (manageOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        if (event.key === "Escape") {
          target.blur();
        }
        return;
      }

      if (event.key === "Escape") {
        if (tocOpen) {
          event.preventDefault();
          setTocOpen(false);
        } else if (helpOpen) {
          event.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        setHelpOpen((prev) => !prev);
        return;
      }

      if (event.key === "t" || event.key === "T") {
        if (!loading && !error) {
          event.preventDefault();
          setTocOpen((prev) => !prev);
        }
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeFont(FONT_STEP);
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        changeFont(-FONT_STEP);
        return;
      }

      if (tocOpen) return;

      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        void go(-1);
      } else if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        void go(1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeFont, error, go, helpOpen, loading, manageOpen, tocOpen]);

  // Determine active TOC index for highlighting & auto-scroll
  const activeTocIndex = useMemo(() => {
    if (toc.length === 0) return -1;
    if (book.format === "txt") {
      return toc.findIndex((entry) => Number(entry.href) === progress.unit);
    }
    if (currentHref) {
      const exact = toc.findIndex((entry) => entry.href === currentHref);
      if (exact >= 0) return exact;
      const cleanCurrent = normalizeHref(currentHref);
      if (cleanCurrent) {
        const byBase = toc.findIndex(
          (entry) =>
            normalizeHref(entry.href) === cleanCurrent ||
            cleanCurrent.endsWith(normalizeHref(entry.href)) ||
            normalizeHref(entry.href).endsWith(cleanCurrent),
        );
        if (byBase >= 0) return byBase;
      }
    }
    return Math.min(toc.length - 1, Math.max(0, progress.unit));
  }, [book.format, currentHref, progress.unit, toc]);

  const filteredToc = useMemo(() => {
    const keyword = tocQuery.trim().toLowerCase();
    const indexed = toc.map((entry, index) => ({ entry, index }));
    if (!keyword) return indexed;
    return indexed.filter(({ entry }) => entry.label.toLowerCase().includes(keyword));
  }, [toc, tocQuery]);

  // Auto-scroll active chapter into center of TOC drawer when opened
  useEffect(() => {
    if (!tocOpen) return;
    const frame = requestAnimationFrame(() => {
      activeTocRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [tocOpen, activeTocIndex]);

  if (book.format === "cbz") {
    return (
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <AsyncState
          tone="empty"
          title="暂不支持 CBZ 在线预览"
          description="当前站内阅读器支持 EPUB 与 TXT 格式在线阅读，请返回书架选择其它书籍或直接下载原文件。"
          actionLabel="返回书架"
          actionHref="/library"
        />
      </div>
    );
  }

  const epub = book.format === "epub";
  const controlsDisabled = loading || turning || Boolean(error);
  const controlClass =
    "inline-flex min-h-9 items-center gap-1 rounded-full border border-white/50 bg-white/70 px-3 text-xs font-medium text-slate-700 transition hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:pointer-events-none disabled:opacity-45 dark:border-white/10 dark:bg-slate-800/75 dark:text-slate-200";
  const activeChapterTitle = activeTocIndex >= 0 ? toc[activeTocIndex]?.label : "";

  return (
    <div className="relative z-10 mx-auto max-w-4xl px-4 py-5 sm:px-6">
      {/* Top Bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/45 bg-white/65 px-4 py-2.5 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/65">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/library"
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-slate-600 transition hover:bg-sky-500/10 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300 dark:hover:text-sky-400"
          >
            <ArrowLeft className="size-4" />
            书架
          </Link>
          <div className="h-4 w-px bg-slate-300/60 dark:bg-white/10" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="line-clamp-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {book.title}
              </h1>
              {bookMeta.category ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-400/35 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/15 dark:text-sky-300">
                  <Tag className="size-2.5" />
                  {bookMeta.category}
                </span>
              ) : null}
            </div>
            <p className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
              {[book.author || "佚名", activeChapterTitle].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        {/* Theme Switcher + Admin Manage + Shortcut Help */}
        <div className="relative flex flex-wrap items-center gap-1.5">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setHelpOpen(false);
                setManageOpen(true);
              }}
              className="mr-1 inline-flex items-center gap-1 rounded-full border border-sky-400/50 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-sky-400/30 dark:bg-sky-400/15 dark:text-sky-300"
            >
              <SlidersHorizontal className="size-3" />
              管理本书
            </button>
          ) : null}
          <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <Palette className="size-3.5 text-sky-500" />
            <span className="hidden sm:inline">纸张</span>
          </span>
          <div role="group" aria-label="阅读纸张主题" className="inline-flex items-center gap-1">
            {THEMES.map((theme) => {
              const selected = theme.key === themeKey;
              return (
                <button
                  key={theme.key}
                  type="button"
                  onClick={() => selectTheme(theme.key)}
                  aria-pressed={selected}
                  title={theme.label}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 ${
                    selected
                      ? "border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                      : "border-white/50 bg-white/55 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-300"
                  }`}
                >
                  <span className={`size-2.5 rounded-full border ${theme.swatch}`} aria-hidden="true" />
                  <span className="hidden md:inline">{theme.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="快捷键说明"
            aria-expanded={helpOpen}
            title="键盘快捷键 (?)"
            onClick={() => setHelpOpen((prev) => !prev)}
            className="ml-1 inline-flex size-7 items-center justify-center rounded-full border border-white/50 bg-white/60 text-slate-600 transition hover:border-sky-400 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-300"
          >
            <CircleHelp className="size-3.5" />
          </button>

          {helpOpen ? (
            <div
              role="dialog"
              aria-label="阅读快捷键"
              className="absolute right-0 top-10 z-30 w-64 rounded-2xl border border-white/50 bg-white/95 p-3.5 text-xs text-slate-700 shadow-xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/95 dark:text-slate-200"
            >
              <div className="mb-2 flex items-center justify-between font-semibold text-slate-800 dark:text-white">
                <span>键盘快捷键</span>
                <button
                  type="button"
                  onClick={() => setHelpOpen(false)}
                  aria-label="关闭快捷键提示"
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <dl className="space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">上一页 / 上一章</dt>
                  <dd className="font-mono">← / PgUp</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">下一页 / 下一章</dt>
                  <dd className="font-mono">→ / PgDn</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">打开 / 关闭目录</dt>
                  <dd className="font-mono">T / Esc</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">调节正文字号</dt>
                  <dd className="font-mono">+ / -</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">快捷键帮助</dt>
                  <dd className="font-mono">?</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </div>

      {/* Status Alerts */}
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-2.5 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/80 dark:text-rose-100"
        >
          {error}{" "}
          <button
            className="font-medium underline focus-visible:outline-2 focus-visible:outline-sky-500"
            type="button"
            onClick={() => {
              setError(null);
              setLoading(true);
              setAttempt((value) => value + 1);
            }}
          >
            重试
          </button>
        </p>
      ) : null}

      {loading ? (
        <div
          role="status"
          className="mb-3 rounded-2xl border border-white/45 bg-white/75 py-12 text-center text-sm text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/75 dark:text-slate-300"
        >
          正在加载书籍内容…
        </div>
      ) : null}

      {syncFailed ? (
        <p
          role="status"
          className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50/90 px-3.5 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-200"
        >
          云端进度同步失败，已在当前浏览器保留进度。{" "}
          <button
            type="button"
            className="font-medium underline focus-visible:outline-2 focus-visible:outline-sky-500"
            onClick={() => {
              if (!canPersist) return;
              latestProgress.current = progress;
              flushProgress();
            }}
          >
            重试同步
          </button>
        </p>
      ) : null}

      {/* Reading Surface */}
      {epub ? (
        <div
          ref={viewerRef}
          style={{
            backgroundColor: resolvedEpubColors.bg,
            color: resolvedEpubColors.fg,
          }}
          className={`h-[68dvh] min-h-72 overflow-hidden rounded-2xl border p-2 shadow-sm transition-colors sm:p-5 ${activeTheme.surfaceClass}`}
        />
      ) : !loading && !error ? (
        <article
          ref={textRef}
          tabIndex={0}
          aria-label="章节正文"
          suppressHydrationWarning
          style={{ fontSize: `${fontSize}px` }}
          className={`max-h-[68dvh] overflow-y-auto rounded-2xl border px-5 py-6 shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 sm:px-10 sm:py-8 [user-select:text] ${activeTheme.surfaceClass}`}
        >
          <div className="mx-auto max-w-[68ch] whitespace-pre-wrap break-words leading-[1.95]">
            {chapters[progress.unit]}
          </div>
        </article>
      ) : null}

      {/* Bottom Controls & Chapter Progress Bar */}
      <div className="mt-3 rounded-2xl border border-white/45 bg-white/70 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70">
        {!loading && !error ? (
          <div className="mb-2.5 flex items-center gap-3">
            {!epub && total > 1 ? (
              <>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  第 {progress.unit + 1} / {total} 章
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, total - 1)}
                  value={progress.unit}
                  aria-label="章节跳转滑块"
                  onChange={(event) => jumpToTxtChapter(Number(event.target.value))}
                  className="h-1.5 flex-1 cursor-pointer accent-sky-600"
                />
                <span className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums text-sky-600 dark:text-sky-400">
                  {progress.percent.toFixed(0)}%
                </span>
              </>
            ) : (
              <>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  {progress.unit + 1} / {total} 节
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all"
                    style={{ width: `${Math.min(100, Math.max(2, progress.percent))}%` }}
                  />
                </div>
                <span
                  className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums text-sky-600 dark:text-sky-400"
                  aria-live="polite"
                >
                  {progress.percent.toFixed(0)}%
                </span>
              </>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={controlClass}
              onClick={() => void go(-1)}
              disabled={controlsDisabled || (epub ? boundaries.start : progress.unit <= 0)}
            >
              <ChevronLeft className="size-4" />
              {epub ? "上一页" : "上一章"}
            </button>
            <button
              type="button"
              className={controlClass}
              onClick={() => void go(1)}
              disabled={controlsDisabled || (epub ? boundaries.end : progress.unit >= total - 1)}
            >
              {epub ? "下一页" : "下一章"}
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={controlClass}
              onClick={() => setTocOpen(true)}
              disabled={loading || Boolean(error)}
            >
              <List className="size-4" />
              目录
              {toc.length > 0 ? (
                <span className="text-[11px] opacity-65">({toc.length})</span>
              ) : null}
            </button>

            <div className="flex items-center gap-1 pl-1">
              <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">字号</span>
              <button
                type="button"
                className={controlClass}
                onClick={() => changeFont(-FONT_STEP)}
                disabled={fontSize <= MIN_FONT_SIZE}
                aria-label="减小字号"
              >
                <Minus className="size-3.5" />
              </button>
              <span
                suppressHydrationWarning
                className="w-7 text-center text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200"
              >
                {fontSize}
              </span>
              <button
                type="button"
                className={controlClass}
                onClick={() => changeFont(FONT_STEP)}
                disabled={fontSize >= MAX_FONT_SIZE}
                aria-label="增大字号"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over TOC Drawer */}
      {tocOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-xs"
          onClick={() => setTocOpen(false)}
          role="presentation"
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="章节目录"
            className="flex h-full w-[min(24rem,88vw)] flex-col bg-white/95 p-4 shadow-2xl backdrop-blur-xl dark:bg-slate-900/95"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-800 dark:text-slate-100">目录</h2>
                <p className="text-[11px] text-slate-400">共 {toc.length} 节 · 按 Esc 关闭</p>
              </div>
              <button
                type="button"
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => setTocOpen(false)}
                aria-label="关闭目录"
              >
                <X className="size-4" />
              </button>
            </div>

            {toc.length > 12 ? (
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={tocQuery}
                  onChange={(event) => setTocQuery(event.target.value)}
                  placeholder="搜索章节标题…"
                  aria-label="搜索目录"
                  className="h-8 w-full rounded-full border border-slate-200 bg-slate-50 pl-8 pr-7 text-xs text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                />
                {tocQuery ? (
                  <button
                    type="button"
                    aria-label="清空目录搜索"
                    onClick={() => setTocQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto pr-1">
              {toc.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  这本书没有提供章节目录。
                </p>
              ) : filteredToc.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  没有匹配的章节标题。
                </p>
              ) : (
                <nav className="space-y-0.5" aria-label="目录列表">
                  {filteredToc.map(({ entry, index }) => {
                    const isActive = index === activeTocIndex;
                    return (
                      <button
                        key={`${entry.href}-${index}`}
                        ref={isActive ? activeTocRef : undefined}
                        type="button"
                        aria-current={isActive ? "location" : undefined}
                        onClick={() => void jumpTo(entry)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg py-2 pr-2.5 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                          isActive
                            ? "bg-sky-500/15 font-semibold text-sky-700 dark:bg-sky-400/15 dark:text-sky-300"
                            : "text-slate-700 hover:bg-sky-50 hover:text-sky-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        }`}
                        style={{ paddingLeft: `${0.65 + entry.depth * 0.75}rem` }}
                        title={entry.label}
                      >
                        <span className="truncate">{entry.label}</span>
                        {isActive ? (
                          <span className="shrink-0 rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            当前
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </nav>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {isAdmin && manageOpen ? (
        <QuickManageBookModal
          book={book}
          meta={bookMeta}
          onClose={() => setManageOpen(false)}
          onSaved={(nextMeta) => {
            setBookMeta(nextMeta);
            setManageOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
