import { z } from "zod";

export const collectionKind = z.enum([
  "link",
  "movie",
  "music",
  "book",
  "product",
  "idea",
]);
export const collectionStatus = z.enum(["saved", "doing", "done", "dropped"]);

export type CollectionKind = z.infer<typeof collectionKind>;
export type CollectionStatus = z.infer<typeof collectionStatus>;

const optionalText = (max: number) => z.string().trim().max(max).default("");

export const collectionInput = z.object({
  kind: collectionKind.default("link"),
  title: z.string().trim().min(1, "标题不能为空").max(200),
  url: optionalText(1000),
  cover: optionalText(1000),
  author: optionalText(100),
  category_id: z.coerce.number().int().positive().nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  rating: z.coerce.number().int().min(0).max(5).default(0),
  status: collectionStatus.default("saved"),
  note: optionalText(2000),
  meta: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  is_public: z.boolean().default(true),
  sort: z.coerce.number().int().min(0).max(9999).default(0),
});

export type CollectionInput = z.infer<typeof collectionInput>;

export const collectionQuery = z.object({
  kind: collectionKind.optional(),
  category: z.coerce.number().int().positive().optional(),
  tag: z.string().trim().max(30).optional(),
  q: z.string().trim().max(100).optional(),
  status: collectionStatus.optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(100),
});

export type CollectionQuery = z.infer<typeof collectionQuery>;

export const collectionIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const bookmarkImportInput = z.object({
  items: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    url: z.httpUrl().max(1000).refine((value) => {
      const url = new URL(value);
      return !url.username && !url.password;
    }),
  })).min(1).max(1000),
});
export type BookmarkImportInput = z.infer<typeof bookmarkImportInput>;

export interface CollectionItem {
  id: number;
  kind: CollectionKind;
  title: string;
  url: string;
  cover: string;
  author: string;
  category_id: number | null;
  category_name: string;
  tags: string[];
  rating: number;
  status: CollectionStatus;
  note: string;
  meta: Record<string, string | number>;
  is_public: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionListResult {
  items: CollectionItem[];
  total: number;
  /** 每种类型的数量，前台用于 Tab 角标。 */
  counts: Record<string, number>;
}
