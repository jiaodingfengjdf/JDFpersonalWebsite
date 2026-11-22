import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { getAdminSession } from "@/server/auth/guard";
import { loadSiteSettings } from "@/server/modules/site-settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return { title: `每日简报 · ${profile.siteTitle}`, description: "新闻、行情、NBA 与账本一览" };
}

interface Digest {
  generated_at: string;
  news: Array<{ title: string; source: string; link: string; published_at: number }>;
  market: Array<{ name: string; price: number; change_pct: number; kind: string; stale: boolean }>;
  nba: Array<{
    away: string;
    home: string;
    away_score: number;
    home_score: number;
    status: string;
    start_at: number;
    follow: boolean;
  }>;
  collection: Array<{ title: string; kind: string; status: string }>;
  ledger: { month: string; income: number; expense: number; balance: number } | null;
}

const money = (value: number) =>
  value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function DigestPage() {
  const admin = await getAdminSession();
  const base = process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:3000";
  const digest = await fetch(`${base}/api/digest`, { cache: "no-store" })
    .then((response) => response.json() as Promise<Digest>)
    .catch(() => null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white">
          <Newspaper className="h-6 w-6 text-sky-500" />
          每日简报
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {digest ? new Date(digest.generated_at).toLocaleString("zh-CN") : "生成中…"}
        </p>
      </div>

      {!digest && (
        <p className="rounded-2xl border border-white/40 bg-white/40 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/40">
          简报暂时取不到，稍后再刷新。
        </p>
      )}

      {digest && (
        <div className="space-y-5">
          {digest.ledger && (
            <section className="rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
              <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                本月账本（{digest.ledger.month}）
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                收入 ¥{money(digest.ledger.income)} · 支出 ¥{money(digest.ledger.expense)} · 结余 ¥
                {money(digest.ledger.balance)}
              </p>
            </section>
          )}

          <section className="rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
            <h2 className="border-b border-white/30 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">
              行情
            </h2>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {digest.market.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <span className="truncate text-slate-700 dark:text-slate-200">{item.name}</span>
                  <span className={item.change_pct >= 0 ? "text-rose-500" : "text-emerald-600"}>
                    {item.price > 0 ? money(item.price) : "—"}{" "}
                    <span className="text-xs">
                      {item.change_pct >= 0 ? "+" : ""}
                      {item.change_pct.toFixed(2)}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {digest.nba.length > 0 && (
            <section className="rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
              <h2 className="border-b border-white/30 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">
                今日/明日 NBA
              </h2>
              <div className="divide-y divide-white/30 dark:divide-white/10">
                {digest.nba.map((game) => (
                  <div key={`${game.away}-${game.home}-${game.start_at}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                      {game.away} @ {game.home}
                      {game.follow ? <span className="ml-1 text-amber-500">★</span> : null}
                    </span>
                    <span className="text-xs text-slate-500">
                      {game.status === "scheduled"
                        ? new Date(game.start_at).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : `${game.away_score}-${game.home_score}`}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
            <h2 className="border-b border-white/30 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">
              新闻
            </h2>
            <div className="divide-y divide-white/30 dark:divide-white/10">
              {digest.news.map((item) => (
                <a
                  key={item.link || item.title}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-2 text-sm hover:text-sky-500"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {item.title}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{item.source}</span>
                </a>
              ))}
              {digest.news.length === 0 && (
                <p className="px-4 py-4 text-sm text-slate-500">还没有抓取新闻。</p>
              )}
            </div>
          </section>

          {digest.collection.length > 0 && (
            <section className="rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
              <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">最近收藏</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {digest.collection.map((item) => item.title).join(" · ")}
              </p>
            </section>
          )}

          {!admin && (
            <p className="text-xs text-slate-400">
              账本部分只在管理员登录后显示。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
