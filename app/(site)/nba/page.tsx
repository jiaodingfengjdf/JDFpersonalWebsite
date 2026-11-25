import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import FilterTabs from "@/components/site/FilterTabs";
import { formatDayTime, formatMonthDay, shanghaiYmd } from "@/lib/format";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { getAdminSession } from "@/server/auth/guard";
import { getNbaService } from "@/server/modules/nba";
import type { NbaGameView } from "@/server/modules/nba/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";

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

/** 分组标题保留北京时间日期与星期，避免服务器在 UTC 时把凌晨比赛归到前一天。 */
function dayLabel(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${formatMonthDay(ymd)} · ${weekday}`;
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

  const grouped = new Map<string, NbaGameView[]>();
  for (const game of games) {
    const key = shanghaiYmd(game.start_at);
    grouped.set(key, [...(grouped.get(key) ?? []), game]);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
            <Trophy className="h-6 w-6 text-amber-500" />
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
          {admin && (
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
      ) : games.length === 0 ? (
        <AsyncState
          tone="empty"
          title="还没有比赛数据"
          description={
            admin
              ? "登录后台「NBA」点一次抓取赛程后即可查看。"
              : "管理员抓取赛程后即可查看。"
          }
          actionLabel={admin ? "去后台抓取" : undefined}
          actionHref={admin ? "/admin/nba" : undefined}
        />
      ) : (
        <div className="space-y-5">
          {[...grouped.entries()].map(([day, dayGames]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-400">
                {dayLabel(day)}
              </h2>
              <div className="divide-y divide-white/30 overflow-hidden rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:divide-white/10 dark:border-white/10 dark:bg-slate-800/45">
                {dayGames.map((game) => {
                  const finished = game.status === "final";
                  const live = game.status === "live";
                  return (
                    <div key={game.game_id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <span className="w-16 shrink-0 text-xs text-slate-400">
                        {formatDayTime(game.start_at).slice(6)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                        {game.away_name} @ {game.home_name}
                        {game.follow && <span className="ml-1 text-amber-500">★</span>}
                      </span>
                      <span className="w-24 shrink-0 text-right">
                        {finished || live ? (
                          <span className="inline-block">
                            <span
                              className={
                                live
                                  ? "font-semibold text-rose-500"
                                  : "font-medium text-slate-700 dark:text-slate-200"
                              }
                            >
                              {game.away_score} - {game.home_score}
                            </span>
                            {live && game.detail ? (
                              <span className="mt-0.5 block text-[10px] font-normal text-rose-500">
                                {game.detail}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">未开始</span>
                        )}
                      </span>
                      <span className="w-14 shrink-0 text-right text-[11px] text-slate-400">
                        {live ? "进行中" : finished ? "已结束" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
