import "server-only";
import { shanghaiYmd } from "@/lib/format";

export interface EspnGame {
  gameId: string;
  season: string;
  homeCode: string;
  awayCode: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  status: "scheduled" | "live" | "final";
  detail: string;
  startAt: number;
  venue: string;
}

interface EspnCompetitor {
  homeAway?: string;
  score?: string;
  team?: { abbreviation?: string; displayName?: string; shortDisplayName?: string };
}

interface EspnEvent {
  id?: string;
  date?: string;
  season?: { year?: number; slug?: string };
  competitions?: Array<{
    status?: { type?: { state?: string; description?: string; detail?: string } };
    competitors?: EspnCompetitor[];
    venue?: { fullName?: string };
  }>;
}

function mapStatus(state: string | undefined): EspnGame["status"] {
  if (state === "in") return "live";
  if (state === "post") return "final";
  return "scheduled";
}

/** ESPN 的三字码偶尔和常见缩写不同，统一到本地球队表。 */
const CODE_ALIAS: Record<string, string> = {
  WSH: "WAS",
  NO: "NOP",
  NOR: "NOP",
  GS: "GSW",
  NY: "NYK",
  SA: "SAS",
  PHO: "PHX",
  UTAH: "UTA",
  BRO: "BKN",
  CHA: "CHA",
};

function normalizeCode(code: string): string {
  return CODE_ALIAS[code.toUpperCase()] ?? code.toUpperCase();
}

/** ESPN 提供 YYYYMMDD；按天抓，避免一次拉太大。 */
export async function fetchScoreboard(dateYmd: string): Promise<EspnGame[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateYmd}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; JDFNBA/1.0)" },
      cache: "no-store",
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { events?: EspnEvent[] };
    const events = json.events ?? [];

    return events.flatMap((event) => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors ?? [];
      const home = competitors.find((item) => item.homeAway === "home");
      const away = competitors.find((item) => item.homeAway === "away");
      if (!event.id || !home?.team?.abbreviation || !away?.team?.abbreviation) return [];

      const statusType = competition?.status?.type;
      const startAt = event.date ? Date.parse(event.date) : Date.now();

      return [
        {
          gameId: event.id,
          season: String(event.season?.year ?? ""),
          homeCode: normalizeCode(home.team.abbreviation),
          awayCode: normalizeCode(away.team.abbreviation),
          homeName: home.team.displayName ?? home.team.shortDisplayName ?? home.team.abbreviation,
          awayName: away.team.displayName ?? away.team.shortDisplayName ?? away.team.abbreviation,
          homeScore: Number(home.score) || 0,
          awayScore: Number(away.score) || 0,
          status: mapStatus(statusType?.state),
          detail: statusType?.detail ?? statusType?.description ?? "",
          startAt: Number.isFinite(startAt) ? startAt : Date.now(),
          venue: competition?.venue?.fullName ?? "",
        },
      ];
    });
  } catch (error) {
    console.error("espn scoreboard failed:", error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** ESPN 的 dates 参数用 YYYYMMDD，但「今天」必须按北京时间判定。 */
export function ymd(date: Date): string {
  return shanghaiYmd(date).replaceAll("-", "");
}
