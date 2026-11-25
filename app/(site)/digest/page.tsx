import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import { formatDateTime, formatDayTime, formatMoney, formatPercent } from "@/lib/format";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { buildDigest } from "@/server/modules/digest";
import type { DigestPayload } from "@/server/modules/digest";
import { loadSiteSettings } from "@/server/modules/site-settings";

export const dynamic = "force-dynamic";

function requireModule(href: string): InterestModule {
  const entry = interestModuleByHref(href);
  if (!entry) throw new Error(`Missing interest module: ${href}`);
  return entry;
}

const MODULE = requireModule("/digest");

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildInterestMetadata({
    title: `${MODULE.pageTitle} · ${profile.siteTitle}`,
    description: MODULE.description,
    path: MODULE.href,
  });
}

function SectionTitle({ title, href }: { title: string; href: string }) {
  return (
    <h2 className="flex items-center justify-between gap-3 border-b border-white/30 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">
      <span>{title}</span>
      <Link
        href={href}
        className="shrink-0 text-xs font-normal text-sky-600 hover:underline dark:text-sky-300"
      >
        查看全部
      </Link>
    </h2>
  );
}

export default async function DigestPage() {
  let digest: DigestPayload | null = null;
  let failed = false;
  try {
    digest = await buildDigest();
  } catch (error) {
    console.error("Failed to build digest", error);
    failed = true;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
          <Newspaper className="h-6 w-6 text-sky-500" />
          {MODULE.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {digest ? formatDateTime(digest.generated_at) : failed ? "加载失败" : "生成中…"}
        </p>
      </div>

      {failed ? (
        <AsyncState
          tone="error"
          title="简报加载失败"
          description="数据暂时取不到，点击下方按钮重新加载。"
          actionLabel="重新加载"
          actionHref="/digest"
        />
      ) : !digest ? (
        <AsyncState tone="loading" title="简报生成中…" description="正在汇总新闻、行情与比赛数据。" />
      ) : (
        <div className="space-y-5">
          {digest.ledger && (
            <section className="rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
              <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                本月账本（{digest.ledger.month}）
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                收入 {formatMoney(digest.ledger.income)} · 支出 {formatMoney(digest.ledger.expense)} · 结余{" "}
                {formatMoney(digest.ledger.balance)}
              </p>
            </section>
          )}

          <section className="rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
            <SectionTitle title="行情" href="/market" />
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {digest.market.map((item) => {
                const hasPrice = Number.isFinite(item.price) && item.price > 0;
                const kind = item.kind === "fund" ? "fund" : item.kind === "index" ? "index" : "stock";
                return (
                  <div key={item.code} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-slate-700 dark:text-slate-200">{item.name}</span>
                      {item.stale ? (
                        <span className="shrink-0 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-600 dark:text-amber-300">
                          缓存数据
                        </span>
                      ) : null}
                    </span>
                    <span className={hasPrice ? (item.change_pct >= 0 ? "text-rose-500" : "text-emerald-600") : "text-slate-400"}>
                      {hasPrice ? (
                        <>
                          {formatMoney(item.price, { kind })}{" "}
                          <span className="text-xs">{formatPercent(item.change_pct, true)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {digest.nba.length > 0 && (
            <section className="rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
              <SectionTitle title="近三天 NBA" href="/nba" />
              <div className="divide-y divide-white/30 dark:divide-white/10">
                {digest.nba.map((game) => (
                  <div key={`${game.away}-${game.home}-${game.start_at}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                      {game.away} @ {game.home}
                      {game.follow ? <span className="ml-1 text-amber-500">★</span> : null}
                    </span>
                    <span className="text-xs text-slate-500">
                      {game.status === "scheduled"
                        ? formatDayTime(game.start_at)
                        : `${game.away_score}-${game.home_score}`}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
            <SectionTitle title="新闻" href="/news" />
            <div className="divide-y divide-white/30 dark:divide-white/10">
              {digest.news.map((item) => {
                const content = (
                  <>
                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{item.source}</span>
                  </>
                );
                const key = item.link || item.title;
                return /^https?:\/\//i.test(item.link) ? (
                  <a
                    key={key}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-2 text-sm hover:text-sky-500"
                  >
                    {content}
                  </a>
                ) : (
                  <div key={key} className="flex items-center gap-3 px-4 py-2 text-sm">
                    {content}
                  </div>
                );
              })}
              {digest.news.length === 0 && (
                <p className="px-4 py-4 text-sm text-slate-500">还没有新闻。</p>
              )}
            </div>
          </section>

          {digest.collection.length > 0 && (
            <section className="rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
              <SectionTitle title="最近收藏" href="/bookmark" />
              <div className="divide-y divide-white/30 dark:divide-white/10">
                {digest.collection.map((item) => (
                  <Link
                    key={`${item.kind}-${item.title}`}
                    href={`/bookmark?q=${encodeURIComponent(item.title)}`}
                    className="flex items-center gap-3 px-4 py-2 text-sm hover:text-sky-500"
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {[item.kind, item.status].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
