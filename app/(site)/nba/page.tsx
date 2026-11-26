import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import FilterTabs from "@/components/site/FilterTabs";
import { shanghaiYmd } from "@/lib/format";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { getAdminSession } from "@/server/auth/guard";
import { getNbaService } from "@/server/modules/nba";
import type { NbaGameView } from "@/server/modules/nba/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import NbaClient from "./NbaClient";

export const dynamic = "force-dynamic";

function requireModule(href: string): InterestModule {
  const found = interestModuleByHref(href);
  if (!found) throw new Error(`Missing interest module: ${href}`);
  return found;
}

const MODULE = requireModule("/nba");

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildInterestMetadata({
    title: `${MODULE.pageTitle} · ${profile.siteTitle}`,
    description: MODULE.description,
    path: MODULE.href,
    indexable: MODULE.indexable,
  });
}

export default async function NbaPage({
  searchParams,
}: {
  searchParams: Promise<{ follow?: string }>;
}) {
  const followParam = (await searchParams).follow;
  const invalidParam = followParam !== undefined && followParam !== "0" && followParam !== "1";
  const followOnly = followParam === "1";
  const admin = await getAdminSession();
  const isAdmin = Boolean(admin);

  let games: NbaGameView[] = [];
  let failed = false;
  if (!invalidParam) {
    try {
      games = await getNbaService().list({ followOnly });
    } catch (error) {
      console.error("Failed to load NBA games", error);
      failed = true;
    }
  }

  const todayYmd = shanghaiYmd(new Date());

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
            <Trophy className="h-6 w-6 text-sky-500" />
            {MODULE.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            近 3 天与未来 7 天 · 数据来自 ESPN
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterTabs
            items={[
              { key: "all", label: "全部", href: "/nba" },
              { key: "follow", label: "我关注的队", href: "/nba?follow=1" },
            ]}
            value={followOnly ? "follow" : "all"}
            aria-label="赛程筛选"
            className="items-center"
          />
          {isAdmin && (
            <Link
              href="/admin/nba"
              className="rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
            >
              管理
            </Link>
          )}
        </div>
      </div>

      {invalidParam ? (
        <AsyncState
          tone="error"
          title="筛选参数无效"
          description="只支持 ?follow=1（我关注的队）或 ?follow=0（全部）。"
          actionLabel="查看全部"
          actionHref={MODULE.href}
        />
      ) : failed ? (
        <AsyncState
          tone="error"
          title="赛程加载失败"
          description="赛程数据暂时取不到，请稍后重新加载。"
          actionLabel="重新加载"
          actionHref={MODULE.href}
        />
      ) : (
        <NbaClient
          games={games}
          followOnly={followOnly}
          todayYmd={todayYmd}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
