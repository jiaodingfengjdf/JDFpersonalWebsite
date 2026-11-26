import type { Metadata } from "next";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { getAdminSession } from "@/server/auth/guard";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { getGamesService } from "@/server/modules/games";
import { gameStatus, type GameItemView, type GameStatus } from "@/server/modules/games/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import GamesClient, { type GameSortMode } from "./GamesClient";

export const dynamic = "force-dynamic";

function requireModule(href: string): InterestModule {
  const entry = interestModuleByHref(href);
  if (!entry) throw new Error(`Missing interest module: ${href}`);
  return entry;
}

const MODULE = requireModule("/games");

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildInterestMetadata({
    title: `${MODULE.pageTitle} · ${profile.siteTitle}`,
    description: MODULE.description,
    path: MODULE.href,
    indexable: MODULE.indexable,
  });
}

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; platform?: string; q?: string; sort?: string }>;
}) {
  const [raw, admin] = await Promise.all([searchParams, getAdminSession()]);
  const parsedStatus = gameStatus.safeParse(raw.status);
  const initialStatus: GameStatus | "all" = parsedStatus.success ? parsedStatus.data : "all";
  const initialPlatform = typeof raw.platform === "string" ? raw.platform.trim().slice(0, 60) : "all";
  const initialQuery = typeof raw.q === "string" ? raw.q.trim().slice(0, 100) : "";
  const initialSort: GameSortMode =
    raw.sort === "hours" || raw.sort === "rating" || raw.sort === "updated"
      ? raw.sort
      : "group";

  let items: GameItemView[] = [];
  let failed = false;
  try {
    items = await getGamesService().list();
  } catch (error) {
    console.error("Failed to load games", error);
    failed = true;
  }

  const done = items.filter((item) => item.status === "done");
  const totalHours = items.reduce((sum, item) => sum + item.hours, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
            <Gamepad2 className="h-6 w-6 text-sky-500" />
            {MODULE.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {failed
              ? "加载失败"
              : `共 ${items.length} 款（含弃坑）· 通关 ${done.length} · 累计 ${totalHours.toFixed(1)} 小时`}
          </p>
        </div>
        {admin ? (
          <Link
            href="/admin/games"
            className="rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
          >
            管理
          </Link>
        ) : null}
      </div>

      {failed ? (
        <AsyncState
          tone="error"
          title="游戏列表加载失败"
          description="数据暂时取不到，点击下方按钮重新加载。"
          actionLabel="重新加载"
          actionHref={MODULE.href}
        />
      ) : (
        <GamesClient
          items={items}
          initialStatus={initialStatus}
          initialPlatform={initialPlatform || "all"}
          initialQuery={initialQuery}
          initialSort={initialSort}
          isAdmin={Boolean(admin)}
        />
      )}
    </div>
  );
}
