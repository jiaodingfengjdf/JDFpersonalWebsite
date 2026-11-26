"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, ExternalLink, Newspaper, RefreshCw, TrendingUp, Trophy, Wallet } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import GlassPanel from "@/components/site/GlassPanel";
import {
  formatDateTime,
  formatDayTime,
  formatElapsed,
  formatMoney,
  formatPercent,
} from "@/lib/format";
import type { DigestPayload } from "@/server/modules/digest";

const COLLECTION_KIND_LABEL: Record<string, string> = {
  link: "站点",
  movie: "影视",
  music: "音乐",
  book: "图书",
  product: "好物",
  idea: "灵感",
};

const COLLECTION_STATUS_LABEL: Record<string, string> = {
  saved: "已收藏",
  doing: "进行中",
  done: "已完成",
  dropped: "已搁置",
};

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

/** 纯函数计算相对发布时间：以简报生成时间为基准，避免 SSR 水合不一致。 */
function newsRelativeLabel(publishedAt: number, generatedAtIso: string): string {
  if (!Number.isFinite(publishedAt) || publishedAt <= 0) return "";
  const pubMs = publishedAt < 1_000_000_000_000 ? publishedAt * 1000 : publishedAt;
  const baseMs = new Date(generatedAtIso).getTime();
  if (Number.isNaN(baseMs)) return "";
  return formatElapsed((baseMs - pubMs) / 1000);
}

export default function DigestClient({
  initialDigest,
  pageTitle,
}: {
  initialDigest: DigestPayload;
  pageTitle: string;
}) {
  const [digest, setDigest] = useState<DigestPayload>(initialDigest);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const marketStats = useMemo(() => {
    let up = 0;
    let down = 0;
    let flat = 0;
    for (const item of digest.market) {
      const hasPrice = Number.isFinite(item.price) && item.price > 0;
      if (!hasPrice || item.change_pct === 0) flat += 1;
      else if (item.change_pct > 0) up += 1;
      else down += 1;
    }
    return { up, down, flat };
  }, [digest.market]);

  const nbaStats = useMemo(() => {
    let live = 0;
    let finalCount = 0;
    let scheduled = 0;
    for (const game of digest.nba) {
      if (game.status === "live") live += 1;
      else if (game.status === "final") finalCount += 1;
      else scheduled += 1;
    }
    return { live, finalCount, scheduled };
  }, [digest.nba]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const response = await fetch("/api/digest", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = (await response.json()) as DigestPayload;
      setDigest(next);
    } catch {
      setRefreshError("刷新简报失败，已保留上次生成的数据。");
    } finally {
      setRefreshing(false);
    }
  }

  const ledger = digest.ledger;
  const ledgerFlowTotal = ledger ? ledger.income + ledger.expense : 0;
  const incomeSharePct =
    ledger && ledgerFlowTotal > 0 ? Math.round((ledger.income / ledgerFlowTotal) * 100) : 0;
  const expenseRatioPct =
    ledger && ledger.income > 0 ? Math.round((ledger.expense / ledger.income) * 100) : null;

  return (
    <div className="space-y-5">
      {/* 页面标题与刷新栏 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
            <Newspaper className="h-6 w-6 text-sky-500" />
            {pageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            更新于 {formatDateTime(digest.generated_at)}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/40 bg-white/55 px-3.5 text-xs font-medium text-slate-700 transition hover:border-sky-300 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-slate-800/55 dark:text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-sky-500 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "刷新中…" : "刷新简报"}
        </button>
      </div>

      {refreshError && (
        <p
          role="alert"
          className="rounded-xl border border-amber-300/60 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          {refreshError}
        </p>
      )}

      {/* 今日简报总览 KPI 卡片行 */}
      <section aria-label="简报总览" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GlassPanel padding="md">
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <TrendingUp className="h-3.5 w-3.5 text-sky-500" />
            行情红绿比
          </p>
          <p className="mt-1.5 text-base font-semibold tabular-nums text-slate-800 dark:text-white">
            <span className="text-rose-500">涨 {marketStats.up}</span>
            <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
            <span className="text-emerald-600">跌 {marketStats.down}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            共 {digest.market.length} 只 · 平盘 {marketStats.flat}
          </p>
        </GlassPanel>

        <GlassPanel padding="md">
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Trophy className="h-3.5 w-3.5 text-sky-500" />
            近期 NBA
          </p>
          <p className="mt-1.5 text-base font-semibold tabular-nums text-slate-800 dark:text-white">
            {digest.nba.length} 场
            {nbaStats.live > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-500">
                {nbaStats.live} LIVE
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            完赛 {nbaStats.finalCount} · 待赛 {nbaStats.scheduled}
          </p>
        </GlassPanel>

        <GlassPanel padding="md">
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Newspaper className="h-3.5 w-3.5 text-sky-500" />
            最新资讯
          </p>
          <p className="mt-1.5 text-base font-semibold tabular-nums text-slate-800 dark:text-white">
            {digest.news.length} 条
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {digest.news[0]
              ? `最新：${newsRelativeLabel(digest.news[0].published_at, digest.generated_at) || digest.news[0].source}`
              : "等待订阅源更新"}
          </p>
        </GlassPanel>

        <GlassPanel padding="md">
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {ledger ? (
              <>
                <Wallet className="h-3.5 w-3.5 text-sky-500" />
                本月结余
              </>
            ) : (
              <>
                <Bookmark className="h-3.5 w-3.5 text-sky-500" />
                最近收藏
              </>
            )}
          </p>
          {ledger ? (
            <>
              <p
                className={`mt-1.5 text-base font-semibold tabular-nums ${
                  ledger.balance > 0
                    ? "text-emerald-600"
                    : ledger.balance < 0
                      ? "text-rose-600"
                      : "text-slate-800 dark:text-white"
                }`}
              >
                {formatMoney(ledger.balance, { sign: ledger.balance !== 0 })}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {ledger.month} · 收藏 {digest.collection.length} 条
              </p>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-base font-semibold tabular-nums text-slate-800 dark:text-white">
                {digest.collection.length} 条
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">公开精选条目</p>
            </>
          )}
        </GlassPanel>
      </section>

      {/* 管理员专属：本月账本收支进度 */}
      {ledger && (
        <section className="rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              本月账本（{ledger.month}）
            </h2>
            <Link
              href={`/ledger?month=${ledger.month}`}
              className="text-xs text-sky-600 hover:underline dark:text-sky-300"
            >
              查看账本详情
            </Link>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm tabular-nums text-slate-600 dark:text-slate-300">
            <span>
              收入 <strong className="font-semibold text-emerald-600">+{formatMoney(ledger.income)}</strong>
              {" · "}支出 <strong className="font-semibold text-rose-600">-{formatMoney(ledger.expense)}</strong>
              {" · "}结余{" "}
              <strong className="font-semibold text-slate-800 dark:text-white">
                {formatMoney(ledger.balance, { sign: ledger.balance !== 0 })}
              </strong>
            </span>
            {expenseRatioPct !== null && (
              <span className="text-xs text-slate-400">支收比 {expenseRatioPct}%</span>
            )}
          </div>
          <div
            className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-500/15"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={incomeSharePct}
            aria-label={`本月收入占比 ${incomeSharePct}%`}
          >
            {ledgerFlowTotal > 0 ? (
              <>
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${incomeSharePct}%` }}
                />
                <div
                  className="h-full bg-rose-500 transition-all"
                  style={{ width: `${100 - incomeSharePct}%` }}
                />
              </>
            ) : null}
          </div>
        </section>
      )}

      {/* 行情 */}
      <section className="rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
        <SectionTitle title="行情" href="/market" />
        {digest.market.length === 0 ? (
          <div className="p-4">
            <AsyncState compact tone="empty" title="暂无自选行情" description="前往行情页或后台添加自选标的。" />
          </div>
        ) : (
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            {digest.market.map((item) => {
              const hasPrice = Number.isFinite(item.price) && item.price > 0;
              const kind = item.kind === "fund" ? "fund" : item.kind === "index" ? "index" : "stock";
              const colorClass = !hasPrice
                ? "text-slate-400"
                : item.change_pct > 0
                  ? "text-rose-500"
                  : item.change_pct < 0
                    ? "text-emerald-600"
                    : "text-slate-600 dark:text-slate-300";
              return (
                <div
                  key={item.code}
                  className="flex items-center justify-between gap-2 rounded-xl bg-slate-500/5 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">{item.name}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{item.code}</span>
                    {item.stale ? (
                      <span className="shrink-0 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-600 dark:text-amber-300">
                        缓存
                      </span>
                    ) : null}
                  </span>
                  <span className={`shrink-0 tabular-nums ${colorClass}`}>
                    {hasPrice ? (
                      <>
                        {formatMoney(item.price, { kind })}{" "}
                        <span className="text-xs">
                          {item.change_pct === 0 ? "0.00%" : formatPercent(item.change_pct, true)}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 近期 NBA */}
      <section className="rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
        <SectionTitle title="近期 NBA" href="/nba" />
        {digest.nba.length === 0 ? (
          <div className="p-4">
            <AsyncState compact tone="empty" title="近期暂无 NBA 比赛" description="可前往 NBA 页面查看完整赛程。" />
          </div>
        ) : (
          <div className="divide-y divide-white/30 dark:divide-white/10">
            {digest.nba.map((game) => {
              const live = game.status === "live";
              const finished = game.status === "final";
              return (
                <div
                  key={`${game.away}-${game.home}-${game.start_at}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {game.away} @ {game.home}
                    {game.follow ? <span className="ml-1 text-amber-500">★</span> : null}
                  </span>
                  {live && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-500">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                      LIVE
                    </span>
                  )}
                  <span
                    className={`shrink-0 tabular-nums text-xs ${
                      live
                        ? "font-semibold text-rose-500"
                        : finished
                          ? "font-medium text-slate-700 dark:text-slate-200"
                          : "text-slate-500"
                    }`}
                  >
                    {game.status === "scheduled"
                      ? formatDayTime(game.start_at)
                      : `${game.away_score} - ${game.home_score}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 新闻 */}
      <section className="rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
        <SectionTitle title="新闻" href="/news" />
        {digest.news.length === 0 ? (
          <div className="p-4">
            <AsyncState compact tone="empty" title="还没有最新资讯" description="订阅源抓取更新后将在此汇总。" />
          </div>
        ) : (
          <div className="divide-y divide-white/30 dark:divide-white/10">
            {digest.news.map((item) => {
              const rel = newsRelativeLabel(item.published_at, digest.generated_at);
              const isExternal = /^https?:\/\//i.test(item.link);
              const content = (
                <>
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {item.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
                    <span>{item.source}</span>
                    {rel && (
                      <>
                        <span>·</span>
                        <span className="tabular-nums">{rel}</span>
                      </>
                    )}
                    {isExternal && <ExternalLink className="h-3 w-3 opacity-70" />}
                  </span>
                </>
              );
              const key = item.link || item.title;
              return isExternal ? (
                <a
                  key={key}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:text-sky-600 dark:hover:text-sky-300"
                >
                  {content}
                </a>
              ) : (
                <div key={key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 最近收藏 */}
      <section className="rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
        <SectionTitle title="最近收藏" href="/bookmark" />
        {digest.collection.length === 0 ? (
          <div className="p-4">
            <AsyncState compact tone="empty" title="暂无公开收藏" description="前往收藏中心浏览或添加条目。" />
          </div>
        ) : (
          <div className="divide-y divide-white/30 dark:divide-white/10">
            {digest.collection.map((item, idx) => {
              const kindText = COLLECTION_KIND_LABEL[item.kind] ?? item.kind;
              const statusText = COLLECTION_STATUS_LABEL[item.status] ?? item.status;
              return (
                <Link
                  key={`${item.kind}-${item.title}-${idx}`}
                  href={`/bookmark?q=${encodeURIComponent(item.title)}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:text-sky-600 dark:hover:text-sky-300"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {item.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-xs text-sky-700 dark:text-sky-300">
                    {[kindText, statusText].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
