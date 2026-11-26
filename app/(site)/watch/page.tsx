import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { getAdminSession } from "@/server/auth/guard";
import { getWatchService } from "@/server/modules/watch";
import {
  watchKind,
  watchStatus,
  type WatchItemView,
  type WatchStatus,
} from "@/server/modules/watch/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import WatchClient, { type WatchKindFilter, type WatchSortMode } from "./WatchClient";

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

export default async function WatchPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string; q?: string; sort?: string }>;
}) {
  const [raw, admin] = await Promise.all([searchParams, getAdminSession()]);
  const parsedStatus = watchStatus.safeParse(raw.status);
  const initialStatus: WatchStatus | "all" = parsedStatus.success ? parsedStatus.data : "all";

  const parsedKind = watchKind.safeParse(raw.kind);
  const initialKind: WatchKindFilter = parsedKind.success ? parsedKind.data : "all";

  const initialQuery = typeof raw.q === "string" ? raw.q.trim().slice(0, 100) : "";
  const initialSort: WatchSortMode =
    raw.sort === "rating" || raw.sort === "year" ? raw.sort : "updated";

  let items: WatchItemView[] = [];
  let failed = false;
  try {
    // 一次性拉取全量，供客户端计算各状态精确计数并支持即时筛选与详情弹窗。
    items = await getWatchService().list(undefined);
  } catch (error) {
    console.error("Failed to load watch list", error);
    failed = true;
  }

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
              : `共 ${items.length} 部 · 在看 / 想看 / 看完 / 弃了`}
          </p>
        </div>
        {admin ? (
          <Link
            href="/admin/watch"
            className="rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
          >
            管理
          </Link>
        ) : null}
      </div>

      {failed ? (
        <AsyncState
          tone="error"
          title="影视列表加载失败"
          description="数据暂时取不到，点击下方按钮重新加载。"
          actionLabel="重新加载"
          actionHref={MODULE.href}
        />
      ) : (
        <WatchClient
          items={items}
          initialStatus={initialStatus}
          initialKind={initialKind}
          initialQuery={initialQuery}
          initialSort={initialSort}
          isAdmin={Boolean(admin)}
        />
      )}
    </div>
  );
}
