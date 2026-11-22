"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { LibraryBookView } from "@/server/modules/library/contracts";

type Rendition = {
  display: () => Promise<void>;
  prev: () => Promise<void>;
  next: () => Promise<void>;
  destroy: () => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  themes: { default: (styles: Record<string, unknown>) => void };
};

function splitChapters(text: string): string[] {
  const matches = [...text.matchAll(/^\s*(第[0-9一二三四五六七八九十百千]+[章节回]|#{1,2}\s+\S.*)$/gm)];
  if (matches.length < 2) return [text];
  const chapters: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
    chapters.push(text.slice(start, end));
  }
  return chapters;
}

export default function Reader({ book, canPersist }: { book: LibraryBookView; canPersist: boolean }) {
  const [text, setText] = useState<string[]>([]);
  const [unit, setUnit] = useState(book.progress?.unit ?? 0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const total = book.format === "txt" ? Math.max(1, text.length) : Math.max(1, book.total_units || 1);

  const saveProgress = useCallback(
    (nextUnit: number, percent: number) => {
      localStorage.setItem(`library-progress-${book.id}`, String(nextUnit));
      if (!canPersist) return;
      void fetch(`/api/admin/library/${book.id}/progress`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unit: nextUnit, offset: 0, percent }),
      }).catch(() => undefined);
    },
    [book.id, canPersist],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);
      setError(null);
      try {
        if (book.format === "txt") {
          const response = await fetch(book.file_url);
          const raw = await response.text();
          if (cancelled) return;
          const chapters = splitChapters(raw);
          setText(chapters);
          const saved = Number(localStorage.getItem(`library-progress-${book.id}`));
          const start = Number.isFinite(saved) ? Math.min(chapters.length - 1, Math.max(0, saved)) : (book.progress?.unit ?? 0);
          setUnit((previous) => (previous === 0 ? start : previous));
        } else if (book.format === "epub") {
          const mod = (await import("epubjs")) as unknown as {
            default: (url: string) => {
              renderTo: (element: HTMLElement, options?: Record<string, unknown>) => Rendition;
              destroy: () => void;
            };
          };
          if (cancelled || !viewerRef.current) return;
          const epub = mod.default(book.file_url);
          const rendition = epub.renderTo(viewerRef.current, {
            width: "100%",
            height: "100%",
            flow: "scrolled-doc",
          });
          rendition.themes.default({ body: { padding: "0 8px", "line-height": "1.9" } });
          await rendition.display();
          renditionRef.current = rendition;
        } else {
          setError("该格式暂不支持在线阅读");
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
      renditionRef.current?.destroy();
      renditionRef.current = null;
    };
  }, [book.id, book.format, book.file_url, book.progress?.unit]);

  const percent = useMemo(() => Math.min(100, ((unit + 1) / total) * 100), [unit, total]);

  function go(delta: number) {
    const next = Math.min(total - 1, Math.max(0, unit + delta));
    if (next === unit) return;
    setUnit(next);
    if (book.format === "epub") {
      void (delta > 0 ? renditionRef.current?.next() : renditionRef.current?.prev());
    }
    saveProgress(next, Math.min(100, ((next + 1) / total) * 100));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 relative z-10 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/library" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-sky-500">
          <ArrowLeft className="h-4 w-4" />
          书架
        </Link>
        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{book.title}</p>
          <p className="text-xs text-slate-400">
            {book.author || "佚名"} · {unit + 1}/{total}
          </p>
        </div>
      </div>

      <div className="mb-3 h-1 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700/70">
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${percent}%` }} />
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>
      )}
      {loading && <p className="py-10 text-center text-sm text-slate-500">加载中…</p>}

      {book.format === "txt" ? (
        <article className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-white/40 bg-white/55 p-5 text-[15px] leading-8 text-slate-800 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200">
          {text[unit] ?? ""}
        </article>
      ) : (
        <div
          ref={viewerRef}
          className="h-[70vh] overflow-hidden rounded-2xl border border-white/40 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-800/60"
        />
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={unit <= 0}
          className="inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40 dark:border-white/10 dark:text-slate-300"
        >
          <ChevronLeft className="h-4 w-4" />
          上一章
        </button>
        <span className="text-xs text-slate-400">{percent.toFixed(0)}%</span>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={unit >= total - 1}
          className="inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40 dark:border-white/10 dark:text-slate-300"
        >
          下一章
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
