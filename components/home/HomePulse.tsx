"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  ExternalLink,
  Headphones,
  Newspaper,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  formatDayTime,
  formatDuration,
  formatMoney,
  formatRelativeTime,
} from "@/lib/format";
import { INTEREST_MODULES } from "@/lib/interest-modules";
import { navDropdownIcons } from "@/lib/nav-dropdown-icons";

interface DigestMarketItem {
  name: string;
  code: string;
  kind: string;
  price: number;
  change_pct: number;
  stale: boolean;
}

interface DigestNbaItem {
  away: string;
  home: string;
  away_score: number;
  home_score: number;
  status: string;
  start_at: number;
  follow: boolean;
}

interface DigestNewsItem {
  title: string;
  source: string;
  link: string;
  published_at: number;
}

interface DigestCollectionItem {
  title: string;
  kind: string;
  status: string;
}

interface DigestData {
  generated_at: string;
  news: DigestNewsItem[];
  market: DigestMarketItem[];
  nba: DigestNbaItem[];
  collection: DigestCollectionItem[];
}

interface ResumeProgress {
  kind: "book" | "podcast";
  title: string;
  detail: string;
  href: string;
  percent?: number;
}

function readLocalResume(): ResumeProgress | null {
  if (typeof window === "undefined") return null;
  try {
    let bestBook: { id: string; unit: number; percent: number } | null = null;
    let bestPodcast: { id: string; seconds: number } | null = null;

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;

      if (key.startsWith("library-progress-v2-")) {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const idMatch = /(\d+)$/.exec(key);
        if (!idMatch) continue;
        try {
          const parsed = JSON.parse(raw) as {
            unit?: unknown;
            percent?: unknown;
            location?: unknown;
          };
          const unit = typeof parsed.unit === "number" && Number.isFinite(parsed.unit) ? parsed.unit : 0;
          const pct = typeof parsed.percent === "number" && Number.isFinite(parsed.percent) ? parsed.percent : 0;
          const hasLoc = typeof parsed.location === "string" && parsed.location.length > 0;
          if (unit > 0 || pct > 0 || hasLoc) {
            if (!bestBook || pct >= bestBook.percent) {
              bestBook = {
                id: idMatch[1],
                unit,
                percent: Math.min(100, Math.max(0, Math.round(pct))),
              };
            }
          }
        } catch {
          // 忽略损坏的进度项
        }
      } else if (key.startsWith("podcast-pos-") || key.startsWith("podcast-progress-v1-")) {
        const raw = window.localStorage.getItem(key);
        const seconds = Number(raw ?? "");
        const idMatch = /([^ -]+)$/.exec(key.replace(/^podcast-(?:pos|progress-v1-(?:owner|guest))-/, ""));
        if (Number.isFinite(seconds) && seconds > 5) {
          if (!bestPodcast || seconds > bestPodcast.seconds) {
            bestPodcast = {
              id: idMatch ? idMatch[1] : "",
              seconds: Math.floor(seconds),
            };
          }
        }
      }
    }

    if (bestBook) {
      const pctLabel = bestBook.percent > 0 ? `${bestBook.percent}%` : `第 ${bestBook.unit + 1} 节`;
      return {
        kind: "book",
        title: `书架藏书 #${bestBook.id}`,
        detail: `上次读到 ${pctLabel} · 点击继续阅读`,
        href: `/library/${bestBook.id}`,
        percent: bestBook.percent > 0 ? bestBook.percent : undefined,
      };
    }

    if (bestPodcast) {
      return {
        kind: "podcast",
        title: bestPodcast.id ? `播客单集 #${bestPodcast.id}` : "订阅播客单集",
        detail: `已收听至 ${formatDuration(bestPodcast.seconds)} · 点击续听`,
        href: "/podcast",
      };
    }
  } catch {
    // 隐私模式下忽略 localStorage 错误
  }
  return null;
}

function formatSignedChange(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  if (pct > 0) return `+${pct.toFixed(2)}%`;
  if (pct < 0) return `${pct.toFixed(2)}%`;
  return "+0.00%";
}

export default function HomePulse() {
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [resume, setResume] = useState<ResumeProgress | null>(null);
  const [reloadSeed, setReloadSeed] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => {
      setResume(readLocalResume());
    });

    async function fetchDigest() {
      try {
        const res = await fetch("/api/digest", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load digest");
        const data = (await res.json()) as DigestData;
        if (controller.signal.aborted) return;
        setDigest(data);
        setError(false);
      } catch {
        if (!controller.signal.aborted) {
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void fetchDigest();
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [reloadSeed]);

  const triggerReload = useCallback(
    (isManualRefresh: boolean) => {
      setResume(readLocalResume());
      setError(false);
      if (isManualRefresh && digest) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setReloadSeed((s) => s + 1);
    },
    [digest],
  );

  return (
    <section
      aria-label="今日脉搏与快速入口"
      className="rounded-3xl border border-white/40 bg-white/45 p-4 sm:p-5 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
    >
      {/* 顶栏 */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
            今日脉搏 · 快速入口
          </h2>
          {digest && !error && (
            <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
              · {formatRelativeTime(digest.generated_at)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => triggerReload(true)}
            disabled={loading || refreshing}
            aria-label="刷新今日脉搏数据"
            title="手动刷新"
            className="inline-flex items-center gap-1 rounded-xl border border-white/40 bg-white/50 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-white/80 hover:text-sky-600 disabled:opacity-50 dark:border-white/10 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-sky-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading || refreshing ? "animate-spin text-sky-500" : ""}`}
              aria-hidden="true"
            />
            <span>刷新</span>
          </button>
          <Link
            href="/digest"
            className="inline-flex items-center gap-0.5 rounded-xl bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-500/20 dark:bg-sky-400/15 dark:text-sky-300 dark:hover:bg-sky-400/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <span>每日简报</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* 异常重试条 */}
      {error && !loading && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-200">
          <span>今日脉搏实时数据暂未获取到，你可以立即重试或直接进入对应模块。</span>
          <button
            type="button"
            onClick={() => triggerReload(false)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 py-1 font-semibold hover:bg-rose-500/30 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            重试
          </button>
        </div>
      )}

      {/* 四宫格实时卡片 */}
      {loading && !digest ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, idx) => (
            <div
              key={idx}
              className="h-[116px] animate-pulse rounded-2xl border border-white/40 bg-white/50 p-3.5 dark:border-white/10 dark:bg-slate-800/60"
            >
              <div className="mb-3 h-3.5 w-20 rounded bg-slate-300/60 dark:bg-slate-700/70" />
              <div className="mb-2 h-3 w-full rounded bg-slate-200/70 dark:bg-slate-700/50" />
              <div className="h-3 w-3/4 rounded bg-slate-200/70 dark:bg-slate-700/50" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. 行情焦点 */}
          <div className="flex flex-col justify-between rounded-2xl border border-white/50 bg-white/60 p-3.5 transition-colors hover:bg-white/75 dark:border-white/10 dark:bg-slate-900/55 dark:hover:bg-slate-900/70">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <TrendingUp className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                行情焦点
              </span>
              <Link
                href="/market"
                className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
              >
                全部 →
              </Link>
            </div>
            {digest && digest.market.length > 0 ? (
              <div className="space-y-1.5">
                {digest.market.slice(0, 2).map((item) => {
                  const hasValidPrice = Number.isFinite(item.price) && item.price > 0;
                  const kind =
                    item.kind === "fund" ? "fund" : item.kind === "index" ? "index" : "stock";
                  const up = item.change_pct >= 0;
                  return (
                    <Link
                      key={item.code}
                      href="/market"
                      className="flex items-center justify-between gap-2 text-xs rounded-lg px-1 py-0.5 -mx-1 hover:bg-slate-200/40 dark:hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="truncate font-medium text-slate-800 dark:text-slate-100">
                          {item.name}
                        </span>
                        {item.stale && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] text-amber-700 dark:text-amber-300">
                            缓存
                          </span>
                        )}
                      </span>
                      {hasValidPrice ? (
                        <span
                          className={`shrink-0 font-mono font-semibold ${
                            up
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {formatMoney(item.price, { kind })}{" "}
                          <span>{formatSignedChange(item.change_pct)}</span>
                        </span>
                      ) : (
                        <span className="shrink-0 text-slate-400 dark:text-slate-500">
                          缺失
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Link
                href="/market"
                className="text-xs text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
              >
                暂无自选行情报价 · 前往看板 →
              </Link>
            )}
          </div>

          {/* 2. NBA 赛况 */}
          <div className="flex flex-col justify-between rounded-2xl border border-white/50 bg-white/60 p-3.5 transition-colors hover:bg-white/75 dark:border-white/10 dark:bg-slate-900/55 dark:hover:bg-slate-900/70">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                NBA 赛况
              </span>
              <Link
                href="/nba"
                className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
              >
                赛程 →
              </Link>
            </div>
            {digest && digest.nba.length > 0 ? (
              <div className="space-y-1.5">
                {digest.nba.slice(0, 2).map((game) => {
                  const isLive = game.status === "live";
                  const isScheduled = game.status === "scheduled";
                  return (
                    <Link
                      key={`${game.away}-${game.home}-${game.start_at}`}
                      href="/nba"
                      className="flex items-center justify-between gap-2 text-xs rounded-lg px-1 py-0.5 -mx-1 hover:bg-slate-200/40 dark:hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">
                        {game.away} @ {game.home}
                        {game.follow && <span className="ml-1 text-amber-500">★</span>}
                      </span>
                      <span
                        className={`shrink-0 font-mono text-[11px] ${
                          isLive
                            ? "font-bold text-rose-600 dark:text-rose-400"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {isScheduled
                          ? formatDayTime(game.start_at)
                          : `${game.away_score}-${game.home_score}${isLive ? " 直播" : ""}`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Link
                href="/nba"
                className="text-xs text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
              >
                近期暂无赛事安排 · 查看完整赛程 →
              </Link>
            )}
          </div>

          {/* 3. 最新资讯 */}
          <div className="flex flex-col justify-between rounded-2xl border border-white/50 bg-white/60 p-3.5 transition-colors hover:bg-white/75 dark:border-white/10 dark:bg-slate-900/55 dark:hover:bg-slate-900/70">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Newspaper className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                最新资讯
              </span>
              <Link
                href="/news"
                className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
              >
                更多 →
              </Link>
            </div>
            {digest && digest.news.length > 0 ? (
              <div className="space-y-1.5">
                {digest.news.slice(0, 2).map((item) => {
                  const isExt = /^https?:\/\//i.test(item.link);
                  const key = item.link || item.title;
                  return isExt ? (
                    <a
                      key={key}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-1.5 text-xs rounded-lg px-1 py-0.5 -mx-1 hover:bg-slate-200/40 dark:hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <span className="min-w-0 truncate text-slate-800 dark:text-slate-100">
                        {item.title}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                    </a>
                  ) : (
                    <Link
                      key={key}
                      href="/news"
                      className="block truncate text-xs text-slate-800 hover:text-sky-600 dark:text-slate-100 dark:hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
                    >
                      {item.title}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Link
                href="/news"
                className="text-xs text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
              >
                暂无聚合新闻 · 前往订阅阅读 →
              </Link>
            )}
          </div>

          {/* 4. 继续上次阅读/收听 或 最近收藏 / 兴趣精选 */}
          <div className="flex flex-col justify-between rounded-2xl border border-white/50 bg-white/60 p-3.5 transition-colors hover:bg-white/75 dark:border-white/10 dark:bg-slate-900/55 dark:hover:bg-slate-900/70">
            {resume ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {resume.kind === "book" ? (
                      <BookOpen className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                    ) : (
                      <Headphones className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                    )}
                    {resume.kind === "book" ? "继续上次阅读" : "继续上次收听"}
                  </span>
                  <Link
                    href={resume.kind === "book" ? "/library" : "/podcast"}
                    className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
                  >
                    {resume.kind === "book" ? "书架 →" : "播客 →"}
                  </Link>
                </div>
                <Link
                  href={resume.href}
                  className="group block rounded-xl bg-sky-500/10 p-2 transition-colors hover:bg-sky-500/20 dark:bg-sky-400/10 dark:hover:bg-sky-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-sky-800 dark:text-sky-200">
                      {resume.title}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-sky-700/80 dark:text-sky-300/80">
                    {resume.detail}
                  </p>
                </Link>
              </>
            ) : digest && digest.collection.length > 0 ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <Bookmark className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                    最近收藏
                  </span>
                  <Link
                    href="/bookmark"
                    className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
                  >
                    全部 →
                  </Link>
                </div>
                <div className="space-y-1.5">
                  {digest.collection.slice(0, 2).map((item) => (
                    <Link
                      key={`${item.kind}-${item.title}`}
                      href={`/bookmark?q=${encodeURIComponent(item.title)}`}
                      className="flex items-center justify-between gap-2 text-xs rounded-lg px-1 py-0.5 -mx-1 hover:bg-slate-200/40 dark:hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <span className="min-w-0 truncate text-slate-800 dark:text-slate-100">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {item.kind}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <Sparkles className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                    阅读与播客
                  </span>
                  <Link
                    href="/library"
                    className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
                  >
                    探索 →
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Link
                    href="/library"
                    className="flex items-center gap-1.5 rounded-xl bg-slate-200/50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-sky-500/15 hover:text-sky-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
                    在线书架
                  </Link>
                  <Link
                    href="/podcast"
                    className="flex items-center gap-1.5 rounded-xl bg-slate-200/50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-sky-500/15 hover:text-sky-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <Headphones className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
                    订阅播客
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 底部兴趣模块快捷矩阵 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-white/35 dark:border-white/10">
        <span className="mr-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          兴趣矩阵
        </span>
        {INTEREST_MODULES.map((mod) => {
          const Icon = navDropdownIcons[mod.icon];
          return (
            <Link
              key={mod.key}
              href={mod.href}
              title={mod.description}
              className="inline-flex items-center gap-1 rounded-xl border border-white/40 bg-white/50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-all hover:-translate-y-0.5 hover:bg-white/85 hover:text-sky-600 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <Icon className="h-3 w-3 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span>{mod.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
