import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./columns";

/** 书架：小说（EPUB/TXT），后续可扩展到漫画（CBZ） */
export const libraryBook = sqliteTable(
  "library_book",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    author: text("author").notNull().default(""),
    /** epub | txt | cbz */
    format: text("format").notNull().default("epub"),
    cover: text("cover").notNull().default(""),
    fileUrl: text("file_url").notNull(),
    bytes: integer("bytes").notNull().default(0),
    /** 章节数 / 页数（TXT 解析或 EPUB 目录） */
    totalUnits: integer("total_units").notNull().default(0),
    status: text("status").notNull().default("reading"),
    rating: integer("rating").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: createdAt().notNull(),
    updatedAt: updatedAt().notNull(),
    // 0027 迁移追加，必须保持在物理表列顺序末尾。
    category: text("category").notNull().default(""),
  },
  (t) => [
    index("idx_library_status").on(t.status),
    index("idx_library_category").on(t.category),
  ],
);

/** 阅读进度（每本书一条） */
export const libraryProgress = sqliteTable("library_progress", {
  bookId: integer("book_id")
    .primaryKey()
    .references(() => libraryBook.id, { onDelete: "cascade" }),
  /** 章节序号，从 0 开始 */
  unit: integer("unit").notNull().default(0),
  /** 章内滚动位置 0~1 */
  offset: real("offset").notNull().default(0),
  percent: real("percent").notNull().default(0),
  updatedAt: updatedAt().notNull(),
  location: text("location").notNull().default(""),
});
