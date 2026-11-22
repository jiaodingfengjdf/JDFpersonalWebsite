import { z } from "zod";

export const feedCategories = ["tech", "china", "world", "finance", "design"] as const;
export type FeedCategory = (typeof feedCategories)[number];

export const sourceInput = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.string().trim().url("请填写完整 RSS 地址").max(500),
  category: z.enum(feedCategories).default("tech"),
  enabled: z.boolean().default(true),
  sort: z.coerce.number().int().min(0).max(9999).default(100),
});

export type SourceInput = z.infer<typeof sourceInput>;

export const itemQuery = z.object({
  category: z.enum(feedCategories).optional(),
  unread: z.coerce.boolean().optional(),
  starred: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

export const itemPatch = z.object({
  read: z.boolean().optional(),
  starred: z.boolean().optional(),
});

export interface FeedSourceItem {
  id: number;
  name: string;
  url: string;
  category: FeedCategory;
  enabled: boolean;
  sort: number;
  last_fetched_at: number | null;
  last_error: string;
  item_count: number;
}

export interface FeedItemView {
  id: number;
  source_id: number;
  source_name: string;
  category: FeedCategory;
  title: string;
  link: string;
  summary: string;
  cover: string;
  published_at: number;
  read: boolean;
  starred: boolean;
}
