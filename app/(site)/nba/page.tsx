import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { getNbaService } from "@/server/modules/nba";
import { loadSiteSettings } from "@/server/modules/site-settings";

export const revalidate = 120;

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return {
    title: `NBA · ${profile.siteTitle}`,
    description: "近期赛程与比分",
  };
}

function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function NbaPage({
  searchParams,
}: {
  searchParams: Promise<{ follow?: string }>;
}) {
  const followOnly = (await searchParams).follow === "1";
  const service = getNbaService();
  const games = await service.list({ followOnly }).catch(() => []);

  const grouped = new Map<string, typeof games>();
  for (const game of games) {
    const key = new Date(game.start_at).toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
    grouped.set(key, [...(grouped.get(key) ?? []), game]);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white">
            <Trophy className="h-6 w-6 text-amber-500" />
            NBA
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            近 3 天与未来 7 天 · 数据来自 ESPN
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/nba"
            className={`rounded-full border px-3 py-1.5 text-xs ${
              followOnly
                ? "border-white/40 text-slate-600 dark:border-white/10 dark:text-slate-300"
                : "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300"
            }`}
          >
            全部
          </Link>
          <Link
            href="/nba?follow=1"
            className={`rounded-full border px-3 py-1.5 text-xs ${
              followOnly
                ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300"
                : "border-white/40 text-slate-600 dark:border-white/10 dark:text-slate-300"
            }`}
          >
            我关注的队
          </Link>
        </div>
      </div>

      {games.length === 0 && (
        <p className="rounded-2xl border border-white/40 bg-white/40 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
          还没有比赛数据。登录后台「NBA」点一次抓取。
        </p>
      )}

      <div className="space-y-5">
        {[...grouped.entries()].map(([day, dayGames]) => (
          <section key={day}>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-400">{day}</h2>
            <div className="divide-y divide-white/30 overflow-hidden rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:divide-white/10 dark:border-white/10 dark:bg-slate-800/45">
              {dayGames.map((game) => {
                const finished = game.status === "final";
                const live = game.status === "live";
                return (
                  <div key={game.game_id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="w-16 shrink-0 text-xs text-slate-400">
                      {timeLabel(game.start_at).slice(6)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                      {game.away_name} @ {game.home_name}
                      {game.follow && <span className="ml-1 text-amber-500">★</span>}
                    </span>
                    <span className="w-24 shrink-0 text-right">
                      {finished || live ? (
                        <span
                          className={
                            live ? "font-semibold text-rose-500" : "font-medium text-slate-700 dark:text-slate-200"
                          }
                        >
                          {game.away_score} - {game.home_score}
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
    </div>
  );
}
