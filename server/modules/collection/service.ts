import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { bookmarkCategory, collectionItem } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import type {
  CollectionInput,
  CollectionItem,
  CollectionListResult,
  CollectionQuery,
  BookmarkImportInput,
} from "./contracts";

type Row = typeof collectionItem.$inferSelect;

function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseMeta(value: string | null): Record<string, string | number> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toItem(row: Row & { categoryName: string | null }): CollectionItem {
  return {
    id: row.id,
    kind: (row.kind as CollectionItem["kind"]) ?? "link",
    title: row.title,
    url: row.url ?? "",
    cover: row.cover ?? "",
    author: row.author ?? "",
    category_id: row.categoryId,
    category_name: row.categoryName ?? "",
    tags: parseTags(row.tags),
    rating: row.rating ?? 0,
    status: (row.status as CollectionItem["status"]) ?? "saved",
    note: row.note ?? "",
    meta: parseMeta(row.meta),
    is_public: Boolean(row.isPublic),
    sort: row.sort ?? 0,
    created_at: (row.createdAt ?? new Date(0)).toISOString(),
    updated_at: (row.updatedAt ?? new Date(0)).toISOString(),
  };
}

export function createCollectionService(db: AppDatabase) {
  const baseSelect = {
    id: collectionItem.id,
    kind: collectionItem.kind,
    title: collectionItem.title,
    url: collectionItem.url,
    cover: collectionItem.cover,
    author: collectionItem.author,
    categoryId: collectionItem.categoryId,
    tags: collectionItem.tags,
    rating: collectionItem.rating,
    status: collectionItem.status,
    note: collectionItem.note,
    meta: collectionItem.meta,
    isPublic: collectionItem.isPublic,
    sort: collectionItem.sort,
    createdAt: collectionItem.createdAt,
    updatedAt: collectionItem.updatedAt,
    categoryName: bookmarkCategory.name,
  } as const;

  async function getById(id: number): Promise<CollectionItem> {
    const [row] = await db
      .select(baseSelect)
      .from(collectionItem)
      .leftJoin(bookmarkCategory, eq(bookmarkCategory.id, collectionItem.categoryId))
      .where(eq(collectionItem.id, id))
      .limit(1);
    if (!row) throw errors.notFound("收藏条目不存在");
    return toItem(row);
  }

  return {
    importBookmarks(input: BookmarkImportInput) {
      const now = new Date();
      return db.transaction((tx) => {
        const existing = new Set(tx.select({ url: collectionItem.url }).from(collectionItem)
          .where(eq(collectionItem.kind, "link")).all().map(({ url }) => {
            try {
              return new URL(url).href;
            } catch {
              return url;
            }
          }));
        let inserted = 0;
        for (const item of input.items) {
          const url = new URL(item.url).href;
          if (existing.has(url)) continue;
          tx.insert(collectionItem).values({
            kind: "link", title: item.title, url, isPublic: 0, createdAt: now, updatedAt: now,
          }).run();
          existing.add(url);
          inserted += 1;
        }
        return { inserted, skipped: input.items.length - inserted };
      }, { behavior: "immediate" });
    },

    async list(
      params: CollectionQuery,
      options: { includePrivate: boolean },
    ): Promise<CollectionListResult> {
      const visibility = options.includePrivate ? undefined : eq(collectionItem.isPublic, 1);
      const conditions = [visibility];
      if (params.kind) conditions.push(eq(collectionItem.kind, params.kind));
      if (params.status) conditions.push(eq(collectionItem.status, params.status));
      if (params.category) conditions.push(eq(collectionItem.categoryId, params.category));
      if (params.tag) {
        conditions.push(sql`exists (select 1 from json_each(
          case when json_valid(${collectionItem.tags}) then ${collectionItem.tags} else '[]' end
        ) where value = ${params.tag})`);
      }
      if (params.q) {
        const pattern = `%${params.q.replace(/[!%_]/g, "!$&")}%`;
        conditions.push(
          or(...[collectionItem.title, collectionItem.note, collectionItem.author, collectionItem.tags].map(
            (column) => sql`${column} LIKE ${pattern} ESCAPE '!'`,
          )),
        );
      }
      const where = and(...conditions);
      const rows = await db.select(baseSelect)
        .from(collectionItem)
        .leftJoin(bookmarkCategory, eq(bookmarkCategory.id, collectionItem.categoryId))
        .where(where)
        .orderBy(asc(collectionItem.sort), desc(collectionItem.id))
        .limit(params.size)
        .offset((params.page - 1) * params.size);

      const [countRows] = await db
        .select({ value: sql<number>`count(*)` })
        .from(collectionItem)
        .where(where);
      const total = countRows?.value ?? rows.length;

      const counts: Record<string, number> = {};
      for (const row of await db
        .select({ kind: collectionItem.kind, value: sql<number>`count(*)` })
        .from(collectionItem)
        .where(visibility)
        .groupBy(collectionItem.kind)) {
        counts[row.kind] = row.value;
      }

      return {
        items: rows.map(toItem),
        total,
        counts,
      };
    },

    async create(input: CollectionInput): Promise<CollectionItem> {
      const now = new Date();
      const [row] = await db
        .insert(collectionItem)
        .values({
          kind: input.kind,
          title: input.title,
          url: input.url,
          cover: input.cover,
          author: input.author,
          categoryId: input.category_id,
          tags: JSON.stringify(input.tags),
          rating: input.rating,
          status: input.status,
          note: input.note,
          meta: JSON.stringify(input.meta),
          isPublic: input.is_public ? 1 : 0,
          sort: input.sort,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: collectionItem.id });
      if (!row) throw errors.internal("保存收藏失败");
      return getById(row.id);
    },

    async update(id: number, input: CollectionInput): Promise<CollectionItem> {
      const [existing] = await db
        .select({ id: collectionItem.id })
        .from(collectionItem)
        .where(eq(collectionItem.id, id))
        .limit(1);
      if (!existing) throw errors.notFound("收藏条目不存在");

      await db
        .update(collectionItem)
        .set({
          kind: input.kind,
          title: input.title,
          url: input.url,
          cover: input.cover,
          author: input.author,
          categoryId: input.category_id,
          tags: JSON.stringify(input.tags),
          rating: input.rating,
          status: input.status,
          note: input.note,
          meta: JSON.stringify(input.meta),
          isPublic: input.is_public ? 1 : 0,
          sort: input.sort,
          updatedAt: new Date(),
        })
        .where(eq(collectionItem.id, id));

      return getById(id);
    },

    async remove(id: number): Promise<void> {
      await db.delete(collectionItem).where(eq(collectionItem.id, id));
    },

    async categories(): Promise<Array<{ id: number; name: string }>> {
      return db
        .select({ id: bookmarkCategory.id, name: bookmarkCategory.name })
        .from(bookmarkCategory)
        .orderBy(asc(bookmarkCategory.sort), asc(bookmarkCategory.id));
    },
  };
}

export type CollectionService = ReturnType<typeof createCollectionService>;
