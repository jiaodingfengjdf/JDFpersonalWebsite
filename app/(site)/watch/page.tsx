import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, Star } from "lucide-react";
import { getWatchService } from "@/server/modules/watch";
import type { WatchStatus } from "@/server/modules/watch/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return { title: `影视 · ${profile.siteTitle}`, description: "想看、在看、看完" };
}

const TABS: Array<{ key: WatchStatus | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "want", label: "想看" },
  { key: "watching", label: "在看" },
  { key: "done", label: "看完" },
];

const KIND_LABEL: Record<string, string> = { movie: "电影", tv: "剧集", anime: "动画" };

export default async function WatchPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const status = (await searchParams).status as WatchStatus | undefined;
  const items = await getWatchService().list(status).catch(() => []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white">
            <Clapperboard className="h-6 w-6 text-sky-500" />
            影视
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            共 {items.length} 部 · 想看 / 在看 / 看完
          </p>
        </div>
        <div className="flex gap-2">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={tab.key === "all" ? "/watch" : `/watch?status=${tab.key}`}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                (status ?? "all") === tab.key
                  ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300"
                  : "border-white/40 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {items.length === 0 && (
        <p className="rounded-2xl border border-white/40 bg-white/40 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
          还没有记录，登录后台「影视」添加。
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <article
            key={item.id}
            className="overflow-hidden rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
          >
            <div className="aspect-[2/3] bg-slate-200/60 dark:bg-slate-700/60">
              {item.poster ? (
                // eslint-disable-next-line @next/next/no-img-element -- 海报来自上传或外链
                <img src={item.poster} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-2xl">🎬</div>
              )}
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.title}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {[item.year, KIND_LABEL[item.kind], item.progress].filter(Boolean).join(" · ")}
              </p>
              {item.rating > 0 && (
                <span className="mt-1 inline-flex items-center gap-0.5 text-amber-500">
                  {Array.from({ length: item.rating }).map((_, index) => (
                    <Star key={index} className="h-3 w-3 fill-current" />
                  ))}
                </span>
              )}
              {item.note && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{item.note}</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
