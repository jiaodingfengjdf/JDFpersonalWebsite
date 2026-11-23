import { desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { libraryBook, libraryProgress } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import type { LibraryBookView } from "./contracts";

type BookRow = typeof libraryBook.$inferSelect;
type ProgressRow = typeof libraryProgress.$inferSelect;

function toView(book: BookRow, progress: ProgressRow | undefined): LibraryBookView {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    format: book.format as LibraryBookView["format"],
    cover: book.cover,
    file_url: book.fileUrl,
    bytes: book.bytes,
    total_units: book.totalUnits,
    status: book.status as LibraryBookView["status"],
    rating: book.rating,
    note: book.note,
    updated_at: (book.updatedAt ?? new Date(0)).toISOString(),
    progress: progress
      ? { unit: progress.unit, offset: progress.offset, percent: progress.percent, location: progress.location }
      : null,
  };
}

export function createLibraryService(db: AppDatabase) {
  return {
    async list(): Promise<LibraryBookView[]> {
      const books = await db
        .select()
        .from(libraryBook)
        .orderBy(desc(libraryBook.updatedAt), desc(libraryBook.id));
      const progressRows = await db.select().from(libraryProgress);
      const progressMap = new Map(progressRows.map((row) => [row.bookId, row]));
      return books.map((book) => toView(book, progressMap.get(book.id)));
    },

    async get(id: number): Promise<LibraryBookView> {
      const [book] = await db.select().from(libraryBook).where(eq(libraryBook.id, id)).limit(1);
      if (!book) throw errors.notFound("书不存在");
      const [progress] = await db
        .select()
        .from(libraryProgress)
        .where(eq(libraryProgress.bookId, id))
        .limit(1);
      return toView(book, progress);
    },

    async create(input: {
      title: string;
      author: string;
      format: "epub" | "txt" | "cbz";
      fileUrl: string;
      bytes: number;
      totalUnits: number;
      cover: string;
    }) {
      const now = new Date();
      const [row] = await db
        .insert(libraryBook)
        .values({
          title: input.title,
          author: input.author,
          format: input.format,
          fileUrl: input.fileUrl,
          bytes: input.bytes,
          totalUnits: input.totalUnits,
          cover: input.cover,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: libraryBook.id });
      if (!row) throw errors.internal("保存书籍失败");
      return { id: row.id };
    },

    async update(
      id: number,
      input: { title: string; author: string; status: string; rating: number; note: string; cover: string },
    ) {
      await db
        .update(libraryBook)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(libraryBook.id, id));
      return { ok: true };
    },

    async remove(id: number) {
      await db.delete(libraryBook).where(eq(libraryBook.id, id));
      return { ok: true };
    },

    async saveProgress(
      bookId: number,
      input: { unit: number; offset: number; percent: number; location: string },
    ) {
      const now = new Date();
      await db
        .insert(libraryProgress)
        .values({
          bookId,
          unit: input.unit,
          offset: input.offset,
          percent: input.percent,
          location: input.location,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: libraryProgress.bookId,
          set: {
            unit: input.unit,
            offset: input.offset,
            percent: input.percent,
            location: input.location,
            updatedAt: now,
          },
        });
      return { ok: true };
    },
  };
}

export type LibraryService = ReturnType<typeof createLibraryService>;
