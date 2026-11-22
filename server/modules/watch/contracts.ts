import { z } from "zod";

export const watchKind = z.enum(["movie", "tv", "anime"]);
export const watchStatus = z.enum(["want", "watching", "done", "dropped"]);
export type WatchStatus = z.infer<typeof watchStatus>;

export const watchInput = z.object({
  kind: watchKind.default("movie"),
  title: z.string().trim().min(1).max(200),
  year: z.coerce.number().int().min(1888).max(2100).nullable().default(null),
  poster: z.string().trim().max(1000).default(""),
  overview: z.string().trim().max(1000).default(""),
  status: watchStatus.default("want"),
  rating: z.coerce.number().int().min(0).max(5).default(0),
  note: z.string().trim().max(1000).default(""),
  progress: z.string().trim().max(20).default(""),
});

export interface WatchItemView {
  id: number;
  kind: "movie" | "tv" | "anime";
  title: string;
  year: number | null;
  poster: string;
  overview: string;
  status: WatchStatus;
  rating: number;
  note: string;
  progress: string;
  updated_at: string;
}
