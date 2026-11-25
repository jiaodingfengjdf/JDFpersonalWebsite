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

/**
 * 查询串里的布尔只认字面 `true` / `1`（或真正的布尔、数字 1）。
 * `z.coerce.boolean()` 会把任意非空字符串当成 true，包括 "false"，
 * 于是 `?unread=false` 反而筛出未读条目。
 */
function queryBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return value === true || value === 1 || value === "true" || value === "1";
}

export const itemQuery = z.object({
  category: z.enum(feedCategories).optional(),
  unread: z.preprocess(queryBoolean, z.boolean().optional()),
  starred: z.preprocess(queryBoolean, z.boolean().optional()),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(60),
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

/** 分页列表：total 与 items 共用同一套 WHERE，hasMore 由偏移与总数推导。 */
export interface FeedItemPage {
  items: FeedItemView[];
  total: number;
  hasMore: boolean;
}
