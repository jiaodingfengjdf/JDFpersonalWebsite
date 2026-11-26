"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, MapPin, RefreshCw, Search, Star, X } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import FilterTabs from "@/components/site/FilterTabs";
import GlassPanel from "@/components/site/GlassPanel";
import { formatDayTime, formatMonthDay, shanghaiYmd } from "@/lib/format";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import type { NbaGameView, NbaTeam } from "@/server/modules/nba/contracts";

type StatusFilter = "all" | "live" | "scheduled" | "final";

/** 分组标题保留北京时间日期与星期，避免服务器在 UTC 时把凌晨比赛归到前一天。 */
function dayLabel(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${formatMonthDay(ymd)} · ${weekday}`;
}

export default function NbaClient({
  games,
  followOnly,
  todayYmd,
  isAdmin,
}: {
  games: NbaGameView[];
  followOnly: boolean;
  todayYmd: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 关注球队设置弹窗
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teams, setTeams] = useState<NbaTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [togglingCode, setTogglingCode] = useState<string | null>(null);

  useEffect(() => {
    if (!teamModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setTeamModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [teamModalOpen]);

  async function loadTeams() {
    setTeamsLoading(true);
    setTeamsError(null);
    try {
      const list = await siteAdminRequest<NbaTeam[]>("/api/admin/nba/teams");
      setTeams(list);
    } catch (error) {
      setTeamsError(describeSiteAdminError(error));
    } finally {
      setTeamsLoading(false);
    }
  }

  function openTeamModal() {
    setTeamSearch("");
    setTeamModalOpen(true);
    void loadTeams();
  }

  async function toggleFollowTeam(team: NbaTeam) {
    if (togglingCode) return;
    const nextFollow = !team.follow;
    setTogglingCode(team.code);
    setTeamsError(null);
    setTeams((prev) =>
      prev.map((item) => (item.code === team.code ? { ...item, follow: nextFollow } : item)),
    );
    try {
      await siteAdminRequest("/api/admin/nba/teams", {
        method: "PUT",
        body: JSON.stringify({ code: team.code, follow: nextFollow }),
      });
      router.refresh();
    } catch (error) {
      setTeams((prev) =>
        prev.map((item) => (item.code === team.code ? { ...item, follow: team.follow } : item)),
      );
      setTeamsError(describeSiteAdminError(error));
    } finally {
      setTogglingCode(null);
    }
  }

  const filteredTeams = useMemo(() => {
    const keyword = teamSearch.trim().toLowerCase();
    if (!keyword) return teams;
    return teams.filter(
      (team) =>
        team.name_zh.toLowerCase().includes(keyword) ||
        team.name_en.toLowerCase().includes(keyword) ||
        team.code.toLowerCase().includes(keyword),
    );
  }, [teams, teamSearch]);

  const followedTeamCount = useMemo(
    () => teams.filter((team) => team.follow).length,
    [teams],
  );

  const stats = useMemo(() => {
    let today = 0;
    let live = 0;
    let finalCount = 0;
    let scheduled = 0;
    let follow = 0;
    for (const game of games) {
      if (shanghaiYmd(game.start_at) === todayYmd) today += 1;
      if (game.status === "live") live += 1;
      else if (game.status === "final") finalCount += 1;
      else scheduled += 1;
      if (game.follow) follow += 1;
    }
    return { today, live, finalCount, scheduled, follow };
  }, [games, todayYmd]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return games.filter((game) => {
      if (statusFilter !== "all" && game.status !== statusFilter) return false;
      if (!keyword) return true;
      return (
        game.away_name.toLowerCase().includes(keyword) ||
        game.home_name.toLowerCase().includes(keyword) ||
        game.away_code.toLowerCase().includes(keyword) ||
        game.home_code.toLowerCase().includes(keyword) ||
        game.venue.toLowerCase().includes(keyword)
      );
    });
  }, [games, statusFilter, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, NbaGameView[]>();
    for (const game of filtered) {
      const key = shanghaiYmd(game.start_at);
      const list = map.get(key);
      if (list) list.push(game);
      else map.set(key, [game]);
    }
    return [...map.entries()];
  }, [filtered]);

  const hasTodayAnchor = useMemo(
    () => grouped.some(([day]) => day === todayYmd),
    [grouped, todayYmd],
  );

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncNotice(null);
    try {
      const response = await fetch("/api/admin/nba/sync", { method: "POST" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSyncNotice({ tone: "ok", text: "赛程同步成功，已刷新最新比分。" });
      router.refresh();
    } catch {
      setSyncNotice({ tone: "err", text: "赛程同步失败，请稍后重试。" });
    } finally {
      setSyncing(false);
    }
  }

  function jumpToToday() {
    const target =
      document.getElementById("nba-today") ??
      document.querySelector<HTMLElement>("[data-nba-day]");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-5">
      {/* 赛况速览条 */}
      <GlassPanel padding="md" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-500/5 px-3 py-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">今日比赛</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-800 dark:text-white">
              {stats.today} <span className="text-xs font-normal text-slate-400">场</span>
            </p>
          </div>
          <div className="rounded-xl bg-slate-500/5 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span
                className={`h-2 w-2 rounded-full ${
                  stats.live > 0 ? "animate-pulse bg-rose-500" : "bg-slate-400/50"
                }`}
              />
              正在直播
            </p>
            <p
              className={`mt-0.5 text-lg font-semibold tabular-nums ${
                stats.live > 0 ? "text-rose-500" : "text-slate-800 dark:text-white"
              }`}
            >
              {stats.live} <span className="text-xs font-normal text-slate-400">LIVE</span>
            </p>
          </div>
          <div className="rounded-xl bg-slate-500/5 px-3 py-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">已完赛</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-800 dark:text-white">
              {stats.finalCount} <span className="text-xs font-normal text-slate-400">场</span>
            </p>
          </div>
          <div className="rounded-xl bg-slate-500/5 px-3 py-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">关注球队场次</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-sky-600 dark:text-sky-300">
              {stats.follow} <span className="text-xs font-normal text-slate-400">场</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/30 pt-2.5 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={jumpToToday}
              disabled={grouped.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/60 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-300"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {hasTodayAnchor ? "跳到今天" : "跳到最近比赛日"}
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "同步中…" : "同步最新赛程"}
                </button>
                <button
                  type="button"
                  onClick={openTeamModal}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-amber-300"
                >
                  <Star className="h-3.5 w-3.5 fill-current" />
                  设置关注球队
                </button>
              </>
            )}
          </div>

          {syncNotice && (
            <p
              role="status"
              className={`text-xs ${
                syncNotice.tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
              }`}
            >
              {syncNotice.text}
            </p>
          )}
        </div>
      </GlassPanel>

      {games.length === 0 ? (
        <AsyncState
          tone="empty"
          title={followOnly ? "关注的球队近期没有比赛" : "还没有比赛数据"}
          description={
            followOnly
              ? "可切换到「全部」查看联盟完整赛程，或在后台调整关注球队。"
              : isAdmin
                ? "点击上方「同步最新赛程」或前往后台「NBA」抓取赛程后即可查看。"
                : "管理员抓取赛程后即可查看。"
          }
          actionLabel={followOnly ? "查看全部赛程" : isAdmin ? "去后台管理" : undefined}
          actionHref={followOnly ? "/nba" : isAdmin ? "/admin/nba" : undefined}
        />
      ) : (
        <>
          {/* 二级客户端筛选栏 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FilterTabs
              items={[
                { key: "all" as const, label: `全部 (${games.length})` },
                { key: "live" as const, label: `进行中 (${stats.live})` },
                { key: "scheduled" as const, label: `未开始 (${stats.scheduled})` },
                { key: "final" as const, label: `已结束 (${stats.finalCount})` },
              ]}
              value={statusFilter}
              onChange={(next) => setStatusFilter(next)}
              aria-label="比赛状态筛选"
            />

            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜队名或缩写 (LAL / GSW)"
                aria-label="搜索球队或场馆"
                className="h-8 w-52 rounded-full border border-white/40 bg-white/60 pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200"
              />
              {query && (
                <button
                  type="button"
                  aria-label="清除球队搜索"
                  onClick={() => {
                    setQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-1.5 grid h-5 w-5 place-items-center rounded-full text-slate-400 hover:bg-slate-500/10 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-slate-200"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {grouped.length === 0 ? (
            <AsyncState
              compact
              tone="empty"
              title="没有符合筛选条件的比赛"
              description="试试切换比赛状态或清空搜索关键词。"
              actionLabel="重置筛选"
              onAction={() => {
                setStatusFilter("all");
                setQuery("");
              }}
            />
          ) : (
            <div className="space-y-6">
              {grouped.map(([day, dayGames]) => {
                const isToday = day === todayYmd;
                return (
                  <section
                    key={day}
                    id={isToday ? "nba-today" : `nba-day-${day}`}
                    data-nba-day={day}
                    className="scroll-mt-20"
                  >
                    <div className="mb-2.5 flex items-center gap-2">
                      <h2
                        className={`text-xs font-semibold tracking-wide ${
                          isToday ? "text-sky-600 dark:text-sky-300" : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {dayLabel(day)}
                      </h2>
                      {isToday && (
                        <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                          今天
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400">· {dayGames.length} 场</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {dayGames.map((game) => {
                        const finished = game.status === "final";
                        const live = game.status === "live";
                        const awayWon = finished && game.away_score > game.home_score;
                        const homeWon = finished && game.home_score > game.away_score;
                        const pointDiff = Math.abs(game.away_score - game.home_score);

                        return (
                          <GlassPanel
                            as="article"
                            key={game.game_id}
                            padding="md"
                            className={`flex flex-col justify-between gap-3 transition ${
                              live
                                ? "border-rose-400/60 ring-1 ring-rose-400/30"
                                : isToday
                                  ? "border-sky-300/50 dark:border-sky-500/25"
                                  : ""
                            }`}
                          >
                            {/* 顶部状态行 */}
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="tabular-nums text-slate-500 dark:text-slate-400">
                                {formatDayTime(game.start_at).slice(6)} 开赛
                              </span>
                              <div className="flex items-center gap-1.5">
                                {game.follow && (
                                  <span
                                    title="关注球队比赛"
                                    className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300"
                                  >
                                    <Star className="h-2.5 w-2.5 fill-current" />
                                    关注
                                  </span>
                                )}
                                {live ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                                    LIVE
                                    {game.detail ? ` · ${game.detail}` : ""}
                                  </span>
                                ) : finished ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                                      分差 {pointDiff}
                                    </span>
                                    <span className="text-[11px] text-slate-400">已完赛</span>
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                    未开始
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 客队 vs 主队记分牌 */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <span
                                    className={`inline-flex h-8 w-11 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold tracking-tight ${
                                      awayWon
                                        ? "bg-sky-500 text-white"
                                        : "bg-slate-500/10 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                                    }`}
                                  >
                                    {game.away_code}
                                  </span>
                                  <span
                                    className={`truncate text-sm ${
                                      awayWon
                                        ? "font-bold text-slate-900 dark:text-white"
                                        : finished
                                          ? "text-slate-500 dark:text-slate-400"
                                          : "font-medium text-slate-700 dark:text-slate-200"
                                    }`}
                                  >
                                    {game.away_name}
                                    <span className="ml-1 text-[10px] font-normal text-slate-400">客</span>
                                  </span>
                                </div>
                                <span
                                  className={`text-lg tabular-nums ${
                                    live
                                      ? "font-bold text-rose-500"
                                      : awayWon
                                        ? "font-bold text-slate-900 dark:text-white"
                                        : finished
                                          ? "font-medium text-slate-400"
                                          : "text-sm text-slate-400"
                                  }`}
                                >
                                  {finished || live ? game.away_score : "—"}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <span
                                    className={`inline-flex h-8 w-11 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold tracking-tight ${
                                      homeWon
                                        ? "bg-sky-500 text-white"
                                        : "bg-slate-500/10 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                                    }`}
                                  >
                                    {game.home_code}
                                  </span>
                                  <span
                                    className={`truncate text-sm ${
                                      homeWon
                                        ? "font-bold text-slate-900 dark:text-white"
                                        : finished
                                          ? "text-slate-500 dark:text-slate-400"
                                          : "font-medium text-slate-700 dark:text-slate-200"
                                    }`}
                                  >
                                    {game.home_name}
                                    <span className="ml-1 text-[10px] font-normal text-slate-400">主</span>
                                  </span>
                                </div>
                                <span
                                  className={`text-lg tabular-nums ${
                                    live
                                      ? "font-bold text-rose-500"
                                      : homeWon
                                        ? "font-bold text-slate-900 dark:text-white"
                                        : finished
                                          ? "font-medium text-slate-400"
                                          : "text-sm text-slate-400"
                                  }`}
                                >
                                  {finished || live ? game.home_score : "—"}
                                </span>
                              </div>
                            </div>

                            {/* 底部球馆信息 */}
                            {game.venue && (
                              <p className="flex items-center gap-1 border-t border-white/25 pt-2 text-[11px] text-slate-400 dark:border-white/10">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{game.venue}</span>
                              </p>
                            )}
                          </GlassPanel>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 关注球队设置弹窗 */}
      {teamModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="nba-teams-modal-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) setTeamModalOpen(false);
          }}
        >
          <div className="relative flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/95">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4 dark:border-white/10">
              <div>
                <h2 id="nba-teams-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                  设置关注球队
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  已关注 {followedTeamCount} 支球队 · 点击卡片即时切换
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTeamModalOpen(false)}
                aria-label="关闭关注球队弹窗"
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-500/10 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-slate-200/60 px-5 py-3 dark:border-white/10">
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
                <input
                  value={teamSearch}
                  onChange={(event) => setTeamSearch(event.target.value)}
                  placeholder="搜索队名（中文 / 英文）或缩写，如 湖人 / Lakers / LAL"
                  aria-label="搜索 NBA 球队"
                  className="h-9 w-full rounded-full border border-slate-200/80 bg-white/80 pl-9 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                />
                {teamSearch ? (
                  <button
                    type="button"
                    aria-label="清空球队搜索"
                    onClick={() => setTeamSearch("")}
                    className="absolute right-2 grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-500/10 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              {teamsError ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
                  <span>{teamsError}</span>
                  <button
                    type="button"
                    onClick={() => void loadTeams()}
                    className="shrink-0 font-medium underline focus-visible:outline-2 focus-visible:outline-rose-500"
                  >
                    重试
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {teamsLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                  加载 30 支球队列表中…
                </div>
              ) : filteredTeams.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  没有匹配的球队
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {filteredTeams.map((team) => {
                    const busy = togglingCode === team.code;
                    return (
                      <button
                        key={team.code}
                        type="button"
                        disabled={Boolean(togglingCode)}
                        aria-pressed={team.follow}
                        onClick={() => void toggleFollowTeam(team)}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-60 ${
                          team.follow
                            ? "border-amber-400/70 bg-amber-500/10 text-slate-900 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-white"
                            : "border-slate-200/70 bg-white/60 text-slate-700 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-slate-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                              {team.code}
                            </span>
                            <span className="truncate text-xs font-semibold">{team.name_zh}</span>
                          </div>
                          <p className="mt-0.5 truncate text-[10px] text-slate-400">{team.name_en}</p>
                        </div>
                        {busy ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" />
                        ) : (
                          <Star
                            className={`h-4 w-4 shrink-0 ${
                              team.follow
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-300 dark:text-slate-600"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
