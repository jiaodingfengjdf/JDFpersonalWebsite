import { z } from "zod";

export const teamFollowInput = z.object({
  code: z.string().trim().min(2).max(5),
  follow: z.boolean(),
});

export interface NbaTeam {
  code: string;
  name_en: string;
  name_zh: string;
  follow: boolean;
}

export interface NbaGameView {
  game_id: string;
  home_code: string;
  home_name: string;
  away_code: string;
  away_name: string;
  home_score: number;
  away_score: number;
  status: "scheduled" | "live" | "final";
  detail: string;
  start_at: number;
  venue: string;
  follow: boolean;
}
