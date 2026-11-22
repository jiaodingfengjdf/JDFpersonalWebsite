import { desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { watchItem } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import type { WatchItemView, WatchStatus } from "./contracts";

export function createWatchService(db: AppDatabase) {
  return {
    async list(status?: WatchStatus): Promise<WatchItemView[]> {
      const rows = await db
        .select()
        .from(watchItem)
        .where(status ? eq(watchItem.status, status) : undefined)
        .orderBy(desc(watchItem.updatedAt), desc(watchItem.id));
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind as WatchItemView["kind"],
        title: row.title,
        year: row.year,
        poster: row.poster,
        overview: row.overview,
        status: row.status as WatchStatus,
        rating: row.rating,
        note: row.note,
        progress: row.progress,
        updated_at: (row.updatedAt ?? new Date(0)).toISOString(),
      }));
    },

    async create(input: {
      kind: string;
      title: string;
      year: number | null;
      poster: string;
      overview: string;
      status: string;
      rating: number;
      note: string;
      progress: string;
    }) {
      const now = new Date();
      const [row] = await db
        .insert(watchItem)
        .values({ ...input, createdAt: now, updatedAt: now })
        .returning({ id: watchItem.id });
      if (!row) throw errors.internal("保存失败");
      return { id: row.id };
    },

    async update(
      id: number,
      input: {
        kind: string;
        title: string;
        year: number | null;
        poster: string;
        overview: string;
        status: string;
        rating: number;
        note: string;
        progress: string;
      },
    ) {
      await db
        .update(watchItem)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(watchItem.id, id));
      return { ok: true };
    },

    async remove(id: number) {
      await db.delete(watchItem).where(eq(watchItem.id, id));
      return { ok: true };
    },
  };
}

export type WatchService = ReturnType<typeof createWatchService>;
