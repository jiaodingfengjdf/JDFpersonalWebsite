import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./columns";
import { bookmarkCategory } from "./bookmark";

/**
 * 统一收藏条目：链接 / 影视 / 音乐 / 书 / 商品 / 灵感。
 * 旧的 bookmark_site 保留（后台仍可维护），迁移时会把链接类条目并进来。
 */
export const collectionItem = sqliteTable(
  "collection_item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull().default("link"),
    title: text("title").notNull(),
    url: text("url").notNull().default(""),
    cover: text("cover").notNull().default(""),
    author: text("author").notNull().default(""),
    categoryId: integer("category_id").references(() => bookmarkCategory.id, {
      onDelete: "set null",
    }),
    /** JSON 字符串数组 */
    tags: text("tags").notNull().default("[]"),
    rating: integer("rating").notNull().default(0),
    status: text("status").notNull().default("saved"),
    note: text("note").notNull().default(""),
    /** 类型专属字段：年份 / 平台 / 价格 / 时长…，JSON 对象 */
    meta: text("meta").notNull().default("{}"),
    isPublic: integer("is_public").notNull().default(1),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_collection_kind").on(t.kind, t.sort),
    index("idx_collection_category").on(t.categoryId),
    index("idx_collection_created").on(t.createdAt),
  ],
);
