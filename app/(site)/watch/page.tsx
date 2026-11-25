import type { Metadata } from "next";
import { Clapperboard } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import FilterTabs from "@/components/site/FilterTabs";
import GlassPanel from "@/components/site/GlassPanel";
import RatingStars from "@/components/site/RatingStars";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { getWatchService } from "@/server/modules/watch";
import { watchStatus, type WatchItemView, type WatchStatus } from "@/server/modules/watch/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";

export const dynamic = "force-dynamic";

function requireModule(href: string): InterestModule {
  const entry = interestModuleByHref(href);
  if (!entry) throw new Error(`Missing interest module: ${href}`);
  return entry;
}

const MODULE = requireModule("/watch");

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildInterestMetadata({
    title: `${MODULE.pageTitle} · ${profile.siteTitle}`,
    description: MODULE.description,
    path: MODULE.href,
    indexable: MODULE.indexable,
  });
}

const STATUS_LABEL: Record<WatchStatus, string> = {
  want: "想看",
  watching: "在看",
  done: "看完",
  dropped: "弃了",
};

const TABS: Array<{ key: WatchStatus | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "want", label: "想看" },
  { key: "watching", label: "在看" },
  { key: "done", label: "看完" },
  { key: "dropped", label: "弃了" },
];

const KIND_LABEL: Record<string, string> = { movie: "电影", tv: "剧集", anime: "动画" };

export default async function WatchPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const parsed = watchStatus.safeParse((await searchParams).status);
  // 非法 status 一律回退「全部」，不再把攻击性参数当成有效筛选。
  const status = parsed.success ? parsed.data : undefined;
  let items: WatchItemView[] = [];
  let failed = false;
  try {
    items = await getWatchService().list(status);
  } catch (error) {
    console.error("Failed to load watch list", error);
    failed = true;
  }
  const retryHref = status ? `/watch?status=${status}` : MODULE.href;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
            <Clapperboard className="h-6 w-6 text-sky-500" />
            {MODULE.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {failed
              ? "加载失败"
              : status
                ? `筛选后 ${items.length} 部 · ${STATUS_LABEL[status]}`
                : `共 ${items.length} 部`}
            {failed ? null : " · 想看 / 在看 / 看完 / 弃了"}
          </p>
        </div>
        <FilterTabs
          items={TABS.map((tab) => ({
            key: tab.key,
            label: tab.label,
            href: tab.key === "all" ? MODULE.href : `${MODULE.href}?status=${tab.key}`,
          }))}
          value={status ?? "all"}
          aria-label="影视状态筛选"
        />
      </div>

      {failed ? (
        <AsyncState
          tone="error"
          title="影视列表加载失败"
          description="数据暂时取不到，点击下方按钮重新加载。"
          actionLabel="重新加载"
          actionHref={retryHref}
        />
      ) : items.length === 0 ? (
        <GlassPanel as="p" tone="soft" padding="lg" className="text-center text-sm text-slate-500 dark:text-slate-400">
          {status ? "没有符合筛选条件的影视。" : "还没有记录，登录后台「影视」添加。"}
        </GlassPanel>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <GlassPanel
              as="article"
              key={item.id}
              id={`watch-${item.id}`}
              className="overflow-hidden"
            >
              <div className="aspect-[2/3] bg-slate-200/60 dark:bg-slate-700/60">
                {item.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 海报来自上传或外链
                  <img src={item.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-2xl">🎬</div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.title}</p>
                  <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-600 dark:text-sky-300">
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {[item.year, KIND_LABEL[item.kind], item.progress].filter(Boolean).join(" · ")}
                </p>
                {item.rating > 0 && (
                  <span className="mt-1 inline-flex items-center gap-0.5">
                    <RatingStars value={item.rating} size="sm" />
                    <span className="ml-1 text-[11px] text-slate-400">{item.rating}/5</span>
                  </span>
                )}
                {item.note && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{item.note}</p>
                )}
              </div>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
