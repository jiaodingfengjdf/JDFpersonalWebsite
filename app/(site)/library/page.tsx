import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import GlassPanel from "@/components/site/GlassPanel";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { getAdminSession } from "@/server/auth/guard";
import { getLibraryService } from "@/server/modules/library";
import type { LibraryBookView } from "@/server/modules/library/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import LibraryShelfClient from "./LibraryShelfClient";

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
  const isAdmin = Boolean(admin);
  // 与 /api/podcast 隐私策略一致：服务端保存的管理员进度不向普通访客下发，访客读取各自浏览器的本地进度。
  const safeBooks = isAdmin ? books : books.map((book) => ({ ...book, progress: null }));

  return (
    <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {failed ? (
        <>
          <div className="mb-6">
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
              <BookOpen className="h-6 w-6 text-sky-500" />
              {MODULE.pageTitle}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">加载失败</p>
          </div>
          <AsyncState
            tone="error"
            title="书架加载失败"
            description="数据暂时取不到，点击下方按钮重新加载。"
            actionLabel="重新加载"
            actionHref={MODULE.href}
          />
        </>
      ) : (
        <Suspense
          fallback={
            <GlassPanel padding="lg" className="text-center text-sm text-slate-500 dark:text-slate-400">
              正在打开书架…
            </GlassPanel>
          }
        >
          <LibraryShelfClient books={safeBooks} isAdmin={isAdmin} pageTitle={MODULE.pageTitle} />
        </Suspense>
      )}
    </div>
  );
}
