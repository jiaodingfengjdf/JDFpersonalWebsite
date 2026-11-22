import { asc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { themePreset } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import type {
  ThemePresetInput,
  ThemePresetItem,
  ThemePresetPublic,
} from "./contracts";

type Row = typeof themePreset.$inferSelect;

function parseList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toItem(row: Row): ThemePresetItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    mode: (row.mode as ThemePresetItem["mode"]) ?? "auto",
    kind: (row.kind as ThemePresetItem["kind"]) ?? "gradient",
    colors: parseList(row.colors),
    images: parseList(row.images),
    blur: row.blur ?? 0,
    cover: row.cover ?? "",
    is_active: Boolean(row.isActive),
    sort: row.sort ?? 0,
  };
}

function toPublic(row: Row): ThemePresetPublic {
  const item = toItem(row);
  const { is_active: _isActive, sort: _sort, ...rest } = item;
  void _isActive;
  void _sort;
  return rest;
}

export function createThemesService(db: AppDatabase) {
  async function rows(): Promise<Row[]> {
    return db
      .select()
      .from(themePreset)
      .orderBy(asc(themePreset.sort), asc(themePreset.id));
  }

  return {
    /** 后台列表：带启用状态与排序。 */
    async list(): Promise<ThemePresetItem[]> {
      return (await rows()).map(toItem);
    },

    /** 前台列表：只需要渲染字段。 */
    async listPublic(): Promise<{ active: ThemePresetPublic | null; presets: ThemePresetPublic[] }> {
      const all = await rows();
      const activeRow = all.find((row) => row.isActive === 1) ?? null;
      return {
        active: activeRow ? toPublic(activeRow) : null,
        presets: all.map(toPublic),
      };
    },

    async get(id: number): Promise<ThemePresetItem> {
      const [row] = await db.select().from(themePreset).where(eq(themePreset.id, id)).limit(1);
      if (!row) throw errors.notFound("主题不存在");
      return toItem(row);
    },

    async create(input: ThemePresetInput): Promise<ThemePresetItem> {
      const now = new Date();
      const [row] = await db
        .insert(themePreset)
        .values({
          name: input.name,
          description: input.description,
          mode: input.mode,
          kind: input.kind,
          colors: JSON.stringify(input.colors),
          images: JSON.stringify(input.images),
          blur: input.blur,
          cover: input.cover,
          sort: input.sort,
          isActive: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw errors.internal("保存主题失败");
      return toItem(row);
    },

    async update(id: number, input: ThemePresetInput): Promise<ThemePresetItem> {
      const [row] = await db
        .update(themePreset)
        .set({
          name: input.name,
          description: input.description,
          mode: input.mode,
          kind: input.kind,
          colors: JSON.stringify(input.colors),
          images: JSON.stringify(input.images),
          blur: input.blur,
          cover: input.cover,
          sort: input.sort,
          updatedAt: new Date(),
        })
        .where(eq(themePreset.id, id))
        .returning();
      if (!row) throw errors.notFound("主题不存在");
      return toItem(row);
    },

    async remove(id: number): Promise<void> {
      const [row] = await db.select().from(themePreset).where(eq(themePreset.id, id)).limit(1);
      if (!row) throw errors.notFound("主题不存在");
      if (row.isActive === 1) throw errors.badRequest("启用中的主题不能删除，请先启用其它主题");
      await db.delete(themePreset).where(eq(themePreset.id, id));
    },

    /** 启用某个主题：唯一索引只允许一行 is_active=1，所以先全部清零再置一。 */
    async activate(id: number): Promise<ThemePresetItem> {
      const [row] = await db.select().from(themePreset).where(eq(themePreset.id, id)).limit(1);
      if (!row) throw errors.notFound("主题不存在");

      db.transaction((tx) => {
        tx.update(themePreset).set({ isActive: 0 }).where(eq(themePreset.isActive, 1)).run();
        tx.update(themePreset)
          .set({ isActive: 1, updatedAt: new Date() })
          .where(eq(themePreset.id, id))
          .run();
      });

      const [updated] = await db
        .select()
        .from(themePreset)
        .where(eq(themePreset.id, id))
        .limit(1);
      return toItem(updated ?? row);
    },

    async count(): Promise<number> {
      const [row] = await db.select({ value: sql<number>`count(*)` }).from(themePreset);
      return row?.value ?? 0;
    },
  };
}

export type ThemesService = ReturnType<typeof createThemesService>;
