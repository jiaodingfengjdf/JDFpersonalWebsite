import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { nbaGame, nbaTeam } from "@/server/db/schema";
import type { NbaGameView, NbaTeam } from "./contracts";
import { fetchScoreboard, ymd } from "./provider";

export function createNbaService(db: AppDatabase) {
  async function teams(): Promise<NbaTeam[]> {
    const rows = await db.select().from(nbaTeam).orderBy(asc(nbaTeam.nameZh));
    return rows.map((row) => ({
      code: row.code,
      name_en: row.nameEn,
      name_zh: row.nameZh,
      follow: Boolean(row.follow),
    }));
  }

  return {
    teams,

    /** 抓取 [今天-3, 今天+7] 的比赛，逐日请求 ESPN。 */
    async sync(): Promise<{ days: number; games: number }> {
      const today = new Date();
      const zhMap = new Map((await teams()).map((team) => [team.code, team.name_zh]));
      let count = 0;
      let days = 0;

      for (let offset = -3; offset <= 7; offset += 1) {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);
        const games = await fetchScoreboard(ymd(date));
        days += 1;
        for (const game of games) {
          const now = Date.now();
          await db
            .insert(nbaGame)
            .values({
              gameId: game.gameId,
              season: game.season,
              homeCode: game.homeCode,
              awayCode: game.awayCode,
              homeName: zhMap.get(game.homeCode) ?? game.homeName,
              awayName: zhMap.get(game.awayCode) ?? game.awayName,
              homeScore: game.homeScore,
              awayScore: game.awayScore,
              status: game.status,
              detail: game.detail.slice(0, 60),
              startAt: game.startAt,
              venue: game.venue.slice(0, 120),
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: nbaGame.gameId,
              set: {
                homeName: zhMap.get(game.homeCode) ?? game.homeName,
                awayName: zhMap.get(game.awayCode) ?? game.awayName,
                homeScore: game.homeScore,
                awayScore: game.awayScore,
                status: game.status,
                detail: game.detail.slice(0, 60),
                startAt: game.startAt,
                updatedAt: now,
              },
            });
          count += 1;
        }
      }
      return { days, games: count };
    },

    async list(
      options: { followOnly?: boolean; days?: number; teams?: NbaTeam[] } = {},
    ): Promise<NbaGameView[]> {
      const days = options.days ?? 7;
      // 与前台「近 3 天」及同步窗口 [今天-3, 今天+7] 对齐。
      const from = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const to = Date.now() + days * 24 * 60 * 60 * 1000;

      // 调用方（/api/nba）可以复用已读出的球队表，避免重复查库。
      const teamRows = options.teams ?? (await teams());
      const followed = teamRows.filter((team) => team.follow).map((team) => team.code);
      const followSet = new Set(followed);

      const rows = await db
        .select()
        .from(nbaGame)
        .where(and(gte(nbaGame.startAt, from), lte(nbaGame.startAt, to)))
        .orderBy(asc(nbaGame.startAt));

      return rows
        .filter((row) =>
          options.followOnly
            ? followSet.has(row.homeCode) || followSet.has(row.awayCode)
            : true,
        )
        .map((row) => ({
          game_id: row.gameId,
          home_code: row.homeCode,
          home_name: row.homeName,
          away_code: row.awayCode,
          away_name: row.awayName,
          home_score: row.homeScore,
          away_score: row.awayScore,
          status: row.status as NbaGameView["status"],
          detail: row.detail,
          start_at: row.startAt,
          venue: row.venue,
          follow: followSet.has(row.homeCode) || followSet.has(row.awayCode),
        }));
    },

    async setFollow(code: string, follow: boolean) {
      await db.update(nbaTeam).set({ follow: follow ? 1 : 0 }).where(eq(nbaTeam.code, code));
      return { ok: true };
    },
  };
}

export type NbaService = ReturnType<typeof createNbaService>;
