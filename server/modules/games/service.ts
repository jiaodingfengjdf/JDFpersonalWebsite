import { desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { gameItem } from "@/server/db/schema";
import type { GameItemView } from "./contracts";

export function createGamesService(db: AppDatabase) {
  return {
    async list(status?: string): Promise<GameItemView[]> {
      const rows = await db
        .select()
        .from(gameItem)
        .where(status ? eq(gameItem.status, status) : undefined)
        .orderBy(desc(gameItem.updatedAt), desc(gameItem.id));
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        platform: row.platform,
        cover: row.cover,
        status: row.status as GameItemView["status"],
        hours: row.hours,
        rating: row.rating,
        note: row.note,
        updated_at: (row.updatedAt ?? new Date(0)).toISOString(),
      }));
    },

    async create(input: {
      title: string;
      platform: string;
      cover: string;
      status: string;
      hours: number;
      rating: number;
      note: string;
    }) {
      const now = new Date();
      const [row] = await db
        .insert(gameItem)
        .values({ ...input, createdAt: now, updatedAt: now })
        .returning({ id: gameItem.id });
      return { id: row?.id ?? 0 };
    },

    async update(
      id: number,
      input: {
        title: string;
        platform: string;
        cover: string;
        status: string;
        hours: number;
        rating: number;
        note: string;
      },
    ) {
      await db
        .update(gameItem)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(gameItem.id, id));
      return { ok: true };
    },

    async remove(id: number) {
      await db.delete(gameItem).where(eq(gameItem.id, id));
      return { ok: true };
    },
  };
}

export type GamesService = ReturnType<typeof createGamesService>;
