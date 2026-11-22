import { z } from "zod";

export const showInput = z.object({
  feedUrl: z.string().trim().url("请填写完整 RSS 地址").max(500),
});

export const positionInput = z.object({
  position: z.coerce.number().min(0).max(100_000),
  played: z.coerce.boolean().default(false),
});

export interface PodcastShowView {
  id: number;
  title: string;
  author: string;
  cover: string;
  description: string;
  feed_url: string;
  episode_count: number;
  last_checked_at: number | null;
  last_error: string;
}

export interface PodcastEpisodeView {
  id: number;
  show_id: number;
  title: string;
  audio_url: string;
  duration: number;
  published_at: number;
  description: string;
  played: boolean;
  position: number;
}
