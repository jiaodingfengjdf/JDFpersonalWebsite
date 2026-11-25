import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import GlassPanel from "@/components/site/GlassPanel";
import RatingStars from "@/components/site/RatingStars";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { getAdminSession } from "@/server/auth/guard";
import { getLibraryService } from "@/server/modules/library";
import type { LibraryBookView } from "@/server/modules/library/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";

export const dynamic = "force-dynamic";

function requireModule(href: string): InterestModule {
  const entry = interestModuleByHref(href);
  if (!entry) throw new Error(`Missing interest module: ${href}`);
  return entry;
}

const MODULE = requireModule("/library");

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildInterestMetadata({
    title: `${MODULE.pageTitle} · ${profile.siteTitle}`,
    description: MODULE.description,
    path: MODULE.href,
    indexable: MODULE.indexable,
  });
}

const STATUS_LABEL: Record<string, string> = {
  unread: "未读",
  reading: "在读",
  done: "读完",
  dropped: "搁置",
};

export default async function LibraryPage() {
  const [admin, booksResult] = await Promise.all([
    getAdminSession(),
    getLibraryService()
      .list()
      .then((items): { items: LibraryBookView[]; failed: false } => ({ items, failed: false }))
      .catch((error): { items: LibraryBookView[]; failed: true } => {
        console.error("Failed to load library", error);
        return { items: [], failed: true };
      }),
  ]);
  const { items: books, failed } = booksResult;
  // 与 /api/podcast 一致：进度属于私人信息，仅登录后台的管理员可见。
  const showProgress = Boolean(admin);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
          <BookOpen className="h-6 w-6 text-sky-500" />
          {MODULE.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {failed ? "加载失败" : `共 ${books.length} 本 · 支持 EPUB 与 TXT`}
        </p>
      </div>

      {failed ? (
        <AsyncState
          tone="error"
          title="书架加载失败"
          description="数据暂时取不到，点击下方按钮重新加载。"
          actionLabel="重新加载"
          actionHref={MODULE.href}
        />
      ) : books.length === 0 ? (
        <GlassPanel as="p" tone="soft" padding="lg" className="text-center text-sm text-slate-500 dark:text-slate-400">
          书架还是空的。登录后台「书架」上传 EPUB / TXT。
        </GlassPanel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <GlassPanel
              key={book.id}
              padding="md"
              className="transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <Link href={`/library/${book.id}`} className="group flex gap-3">
              <div className="h-24 w-16 shrink-0 overflow-hidden rounded bg-slate-200/60 dark:bg-slate-700/60">
                {book.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 封面来自上传或外链
                  <img src={book.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-lg">📖</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 group-hover:text-sky-600 dark:text-slate-100">
                  {book.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {[
                    book.author,
                    STATUS_LABEL[book.status] ?? book.status,
                    book.format.toUpperCase(),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {book.rating > 0 ? (
                    <>
                      {" · "}
                      <RatingStars value={book.rating} size="sm" />
                      <span className="text-slate-400">{book.rating}/5</span>
                    </>
                  ) : null}
                </p>
                {book.note ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{book.note}</p>
                ) : null}
                {showProgress ? (
                  book.progress ? (
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
                  )
                ) : null}
              </div>
              </Link>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
