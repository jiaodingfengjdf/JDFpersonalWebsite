"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import AdminError from "./AdminError";
import AdminPageHeader from "./AdminPageHeader";
import { adminRequest, describeAdminError } from "./admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { NbaGameView, NbaTeam } from "@/server/modules/nba/contracts";

export default function NbaManager() {
  const [games, setGames] = useState<NbaGameView[]>([]);
  const [teams, setTeams] = useState<NbaTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [json, all] = await Promise.all([
        adminRequest<{ games: NbaGameView[]; teams: NbaTeam[] }>("/api/nba"),
        adminRequest<NbaTeam[]>("/api/admin/nba/teams").catch(() => null),
      ]);
      setGames(json.games);
      if (all) setTeams(all);
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(frame);
  }, [load]);

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminRequest<{ days: number; games: number }>("/api/admin/nba/sync", {
        method: "POST",
      });
      setMessage(`抓取完成：扫描 ${result.days} 天，命中 ${result.games} 场比赛`);
      await load();
    } catch (reason) {
      setError(describeAdminError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(team: NbaTeam) {
    try {
      await adminRequest("/api/admin/nba/teams", {
        method: "PUT",
        body: JSON.stringify({ code: team.code, follow: !team.follow }),
      });
      setTeams((prev) =>
        prev.map((item) => (item.code === team.code ? { ...item, follow: !item.follow } : item)),
      );
    } catch (reason) {
      setError(describeAdminError(reason));
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="生活"
        title="NBA"
        description="关注球队、抓取近期赛程与比分；前台 /nba 可切换「全部 / 我关注的队」。"
        actions={
          <Button size="sm" onClick={sync} disabled={busy}>
            <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "抓取中…" : "抓取赛程"}
          </Button>
        }
      />

      {error && <AdminError message={error} />}
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>关注球队（{teams.filter((team) => team.follow).length}）</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-2 p-4 pt-0">
          {teams.map((team) => (
            <button
              key={team.code}
              type="button"
              onClick={() => void toggle(team)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                team.follow
                  ? "border-amber-500 bg-amber-500/10 text-amber-600"
                  : "border-slate-200 text-slate-500 hover:border-amber-300 dark:border-white/10 dark:text-slate-400"
              }`}
            >
              {team.name_zh}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>近期比赛（{games.length}）</CardTitle>
        </CardHeader>
        <div className="divide-y p-4 pt-0">
          {loading && <p className="py-3 text-sm text-muted-foreground">加载中…</p>}
          {!loading && games.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">还没有数据，点右上「抓取赛程」。</p>
          )}
          {games.map((game) => (
            <div key={game.game_id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">
                {new Date(game.start_at).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="flex-1 truncate">
                {game.away_name} @ {game.home_name}
                {game.follow && <span className="ml-1 text-amber-500">★</span>}
              </span>
              <span className="w-20 text-right font-medium">
                {game.status === "scheduled" ? "—" : `${game.away_score}-${game.home_score}`}
              </span>
              <span className="w-16 text-right text-xs text-muted-foreground">
                {game.status === "final" ? "已结束" : game.status === "live" ? "进行中" : "未开始"}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
