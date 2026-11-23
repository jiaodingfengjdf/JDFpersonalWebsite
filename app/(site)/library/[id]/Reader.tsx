"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { Book, Location, Rendition } from "epubjs";
import type { LibraryBookView } from "@/server/modules/library/contracts";
import { splitChapters } from "@/lib/library-chapters";

type Progress = NonNullable<LibraryBookView["progress"]>;
const EMPTY_PROGRESS: Progress = { unit: 0, offset: 0, percent: 0, location: "" };

function readProgress(key: string, fallback: Progress | null, allowLegacy: boolean): Progress {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const { unit, location }: Progress = JSON.parse(saved);
      if (Number.isSafeInteger(unit) && unit >= 0 && typeof location === "string") {
        return { ...EMPTY_PROGRESS, unit, location };
      }
    }
    if (allowLegacy) {
      const legacy = localStorage.getItem(key.replace(/-v2-(?:owner|guest)-/, "-"));
      if (legacy !== null && /^\d+$/.test(legacy)) return { ...EMPTY_PROGRESS, unit: Number(legacy) };
    }
  } catch {
    // Storage may be unavailable in private browsing.
  }
  return fallback ?? EMPTY_PROGRESS;
}

export default function Reader({ book, canPersist }: { book: LibraryBookView; canPersist: boolean }) {
  const [chapters, setChapters] = useState<string[]>([]);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [total, setTotal] = useState(1);
  const [boundaries, setBoundaries] = useState({ start: true, end: true });
  const [loading, setLoading] = useState(true);
  const [turning, setTurning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const progressQueue = useRef(Promise.resolve());
  const latestProgress = useRef<Progress | null>(null);
  const textRef = useRef<HTMLElement>(null);
  const progressKey = `library-progress-v2-${canPersist ? "owner" : "guest"}-${book.id}`;

  const saveProgress = useCallback((next: Progress) => {
    try {
      localStorage.setItem(progressKey, JSON.stringify(next));
    } catch {
      // The reader remains usable without local storage.
    }
    if (!canPersist) return;

    latestProgress.current = next;
    progressQueue.current = progressQueue.current.then(async () => {
      if (latestProgress.current !== next) return;
      try {
        const response = await fetch(`/api/admin/library/${book.id}/progress`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(next),
          keepalive: true,
          signal: AbortSignal.timeout(10_000),
        });
        setSyncFailed(!response.ok);
      } catch {
        setSyncFailed(true);
      }
    });
  }, [book.id, canPersist, progressKey]);

  useEffect(() => {
    const controller = new AbortController();
    let epub: Book | undefined;
    const start = readProgress(progressKey, canPersist ? book.progress : null, book.format === "txt");

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
          setProgress({ ...EMPTY_PROGRESS, unit, percent: ((unit + 1) / parts.length) * 100 });
        } else {
          const [{ default: openEpub }, bytes] = await Promise.all([import("epubjs"), response.arrayBuffer()]);
          if (controller.signal.aborted || !viewerRef.current) return;
          epub = openEpub();
          await epub.open(bytes, "binary");
          if (controller.signal.aborted) return;
          let sections = 0;
          epub.spine.each(() => { sections += 1; });
          if (!sections) throw new Error("EPUB 没有可阅读的章节。");
          setTotal(sections);

          const rendition = epub.renderTo(viewerRef.current, {
            width: "100%", height: "100%", flow: "paginated", spread: "none", allowScriptedContent: false,
          });
          renditionRef.current = rendition;
          rendition.themes.default({ body: { padding: "0 8px", "line-height": "1.9" } });
          let initialLocation = true;
          rendition.on("relocated", (location: Location) => {
            if (controller.signal.aborted || !location.start) return;
            const { index, cfi, displayed } = location.start;
            const offset = displayed ? displayed.page / Math.max(1, displayed.total) : 1;
            const next = {
              unit: Math.max(0, index),
              offset: Math.min(1, Math.max(0, offset)),
              percent: location.atEnd ? 100 : Math.min(100, ((index + offset) / sections) * 100),
              location: typeof cfi === "string" && cfi.length <= 1024 ? cfi : "",
            };
            setBoundaries({ start: location.atStart, end: location.atEnd });
            setProgress(next);
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
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "加载失败");
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
  }, [attempt, book.file_url, book.format, book.progress, canPersist, progressKey, saveProgress]);

  async function go(delta: -1 | 1) {
    if (loading || turning) return;
    if (book.format === "txt") {
      const unit = Math.min(total - 1, Math.max(0, progress.unit + delta));
      if (unit === progress.unit) return;
      const next = { ...EMPTY_PROGRESS, unit, percent: ((unit + 1) / total) * 100 };
      setProgress(next);
      textRef.current?.scrollTo(0, 0);
      saveProgress(next);
      return;
    }

    setTurning(true);
    try {
      if (delta > 0) await renditionRef.current?.next();
      else await renditionRef.current?.prev();
    } catch {
      setError("无法翻页，请重新加载书籍。");
    } finally {
      setTurning(false);
    }
  }

  const epub = book.format === "epub";
  const controlsDisabled = loading || turning || Boolean(error);
  const controlClass = "inline-flex min-h-10 items-center gap-1 rounded-full border border-white/50 bg-white/60 px-3 text-sm text-slate-700 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-200";

  return (
    <div className="relative z-10 mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <Link href="/library" className="inline-flex shrink-0 items-center gap-1 text-sm text-slate-600 hover:text-sky-600 dark:text-slate-300">
          <ArrowLeft className="size-4" /> 书架
        </Link>
        <div className="min-w-0 text-right">
          <h1 className="break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{book.title}</h1>
          <p className="text-xs text-slate-600 dark:text-slate-300">{book.author || "佚名"}</p>
        </div>
      </div>

      {error && <p role="alert" className="mb-3 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">
        {error}{" "}
        <button className="underline" type="button" onClick={() => {
          setError(null);
          setLoading(true);
          setAttempt((value) => value + 1);
        }}>重试</button>
      </p>}
      {loading && <p role="status" className="py-4 text-center text-sm text-slate-600 dark:text-slate-300">正在加载书籍…</p>}
      {syncFailed && <p role="status" className="mb-3 text-sm text-amber-800 dark:text-amber-200">
        同步失败，可在当前浏览器继续阅读。{" "}
        <button type="button" className="underline" onClick={() => saveProgress(progress)}>重试同步</button>
      </p>}

      {epub ? (
        <div ref={viewerRef} className="h-[65dvh] min-h-64 overflow-hidden rounded-2xl border border-white/40 bg-white p-2 text-slate-900 sm:p-4" />
      ) : !loading && !error && (
        <article ref={textRef} tabIndex={0} aria-label="章节正文" className="max-h-[65dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-white/40 bg-white/80 p-5 text-[15px] leading-8 text-slate-800 [user-select:text] dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100">
          {chapters[progress.unit]}
        </article>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" className={controlClass} onClick={() => void go(-1)} disabled={controlsDisabled || (epub ? boundaries.start : progress.unit <= 0)}>
          <ChevronLeft className="size-4" /> {epub ? "上一页" : "上一章"}
        </button>
        {!loading && !error && <p className="text-center text-xs text-slate-600 dark:text-slate-300" aria-live="polite">
          {progress.unit + 1} / {total} · {progress.percent.toFixed(0)}%
        </p>}
        <button type="button" className={controlClass} onClick={() => void go(1)} disabled={controlsDisabled || (epub ? boundaries.end : progress.unit >= total - 1)}>
          {epub ? "下一页" : "下一章"} <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
