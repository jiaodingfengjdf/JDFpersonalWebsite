import { z } from "zod";

export const gameStatus = z.enum(["playing", "done", "backlog", "dropped"]);
export type GameStatus = z.infer<typeof gameStatus>;

export const gameInput = z.object({
  title: z.string().trim().min(1).max(150),
  platform: z.string().trim().max(60).default(""),
  cover: z.string().trim().max(1000).default(""),
  status: gameStatus.default("playing"),
  hours: z.coerce.number().min(0).max(100000).default(0),
  rating: z.coerce.number().int().min(0).max(5).default(0),
  note: z.string().trim().max(1000).default(""),
});

export interface GameItemView {
  id: number;
  title: string;
  platform: string;
  cover: string;
  status: GameStatus;
  hours: number;
  rating: number;
  note: string;
  updated_at: string;
}
