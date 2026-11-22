import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getLibraryService } from "@/server/modules/library";
import { loadSiteSettings } from "@/server/modules/site-settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return { title: `书架 · ${profile.siteTitle}`, description: "在读与读过的书" };
}

const STATUS_LABEL: Record<string, string> = {
  unread: "未读",
  reading: "在读",
  done: "读完",
  dropped: "搁置",
};

export default async function LibraryPage() {
  const books = await getLibraryService().list().catch(() => []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white">
          <BookOpen className="h-6 w-6 text-sky-500" />
          书架
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          共 {books.length} 本 · 支持 EPUB 与 TXT
        </p>
      </div>

      {books.length === 0 && (
        <p className="rounded-2xl border border-white/40 bg-white/40 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
          书架还是空的。登录后台「书架」上传 EPUB / TXT。
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {books.map((book) => (
          <Link
            key={book.id}
            href={`/library/${book.id}`}
            className="group flex gap-3 rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-800/45"
          >
            <div className="h-24 w-16 shrink-0 overflow-hidden rounded bg-slate-200/60 dark:bg-slate-700/60">
              {book.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- 封面来自上传或外链
                <img src={book.cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-lg">📖</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800 group-hover:text-sky-600 dark:text-slate-100">
                {book.title}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {[book.author, STATUS_LABEL[book.status] ?? book.status, book.format.toUpperCase()]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {book.progress ? (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700/70">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.min(100, book.progress.percent)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    读到 {book.progress.percent.toFixed(0)}%
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-slate-400">还没开始</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
