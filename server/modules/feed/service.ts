import { and, desc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { feedItem, feedSource } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import type { FeedCategory, FeedItemView, FeedSourceItem, SourceInput } from "./contracts";
import { fetchFeed } from "./provider";

export function createFeedService(db: AppDatabase) {
  async function listSources(): Promise<FeedSourceItem[]> {
    const rows = await db
      .select({
        id: feedSource.id,
        name: feedSource.name,
        url: feedSource.url,
        category: feedSource.category,
        enabled: feedSource.enabled,
        sort: feedSource.sort,
        lastFetchedAt: feedSource.lastFetchedAt,
        lastError: feedSource.lastError,
        itemCount: sql<number>`(select count(*) from feed_item where feed_item.source_id = feed_source.id)`,
      })
      .from(feedSource)
      .orderBy(feedSource.sort, feedSource.id);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      category: row.category as FeedCategory,
      enabled: Boolean(row.enabled),
      sort: row.sort,
      last_fetched_at: row.lastFetchedAt,
      last_error: row.lastError,
      item_count: row.itemCount,
    }));
  }

  return {
    sources: listSources,

    async createSource(input: SourceInput) {
      const now = new Date();
      const [row] = await db
        .insert(feedSource)
        .values({
          name: input.name,
          url: input.url,
          category: input.category,
          enabled: input.enabled ? 1 : 0,
          sort: input.sort,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: feedSource.id });
      if (!row) throw errors.badRequest("这个订阅地址已经存在");
      return { id: row.id };
    },

    async updateSource(id: number, input: SourceInput) {
      await db
        .update(feedSource)
        .set({
          name: input.name,
          url: input.url,
          category: input.category,
          enabled: input.enabled ? 1 : 0,
          sort: input.sort,
          updatedAt: new Date(),
        })
        .where(eq(feedSource.id, id));
      return { ok: true };
    },

    async removeSource(id: number) {
      await db.delete(feedSource).where(eq(feedSource.id, id));
      return { ok: true };
    },

    /** 抓取全部启用的源；单个源失败只记录错误，不影响其它源。 */
    async refresh(): Promise<{ fetched: number; inserted: number; failed: number }> {
      const sources = await db
        .select()
        .from(feedSource)
        .where(eq(feedSource.enabled, 1));

      let inserted = 0;
      let failed = 0;
      let fetched = 0;

      for (const source of sources) {
        try {
          const entries = await fetchFeed(source.url);
          fetched += entries.length;
          for (const entry of entries.slice(0, 50)) {
            const result = await db
              .insert(feedItem)
              .values({
                sourceId: source.id,
                guid: entry.guid.slice(0, 500),
                title: entry.title.slice(0, 300),
                link: entry.link.slice(0, 800),
                summary: entry.summary,
                cover: entry.cover.slice(0, 800),
                publishedAt: entry.publishedAt,
                createdAt: new Date(),
              })
              .onConflictDoNothing()
              .returning({ id: feedItem.id });
            if (result.length > 0) inserted += 1;
          }
          await db
            .update(feedSource)
            .set({ lastFetchedAt: Date.now(), lastError: "", updatedAt: new Date() })
            .where(eq(feedSource.id, source.id));
        } catch (error) {
          failed += 1;
          await db
            .update(feedSource)
            .set({
              lastFetchedAt: Date.now(),
              lastError: error instanceof Error ? error.message.slice(0, 200) : "抓取失败",
              updatedAt: new Date(),
            })
            .where(eq(feedSource.id, source.id));
        }
      }

      return { fetched, inserted, failed };
    },

    async list(params: {
      category?: FeedCategory;
      unread?: boolean;
      starred?: boolean;
      limit: number;
    }): Promise<FeedItemView[]> {
      const conditions = [eq(feedSource.enabled, 1)];
      if (params.category) conditions.push(eq(feedSource.category, params.category));
      if (params.unread) conditions.push(eq(feedItem.read, 0));
      if (params.starred) conditions.push(eq(feedItem.starred, 1));

      const rows = await db
        .select({
          id: feedItem.id,
          sourceId: feedItem.sourceId,
          sourceName: feedSource.name,
          category: feedSource.category,
          title: feedItem.title,
          link: feedItem.link,
          summary: feedItem.summary,
          cover: feedItem.cover,
          publishedAt: feedItem.publishedAt,
          read: feedItem.read,
          starred: feedItem.starred,
        })
        .from(feedItem)
        .innerJoin(feedSource, eq(feedSource.id, feedItem.sourceId))
        .where(and(...conditions))
        .orderBy(desc(feedItem.publishedAt), desc(feedItem.id))
        .limit(params.limit);

      return rows.map((row) => ({
        id: row.id,
        source_id: row.sourceId,
        source_name: row.sourceName,
        category: row.category as FeedCategory,
        title: row.title,
        link: row.link,
        summary: row.summary,
        cover: row.cover,
        published_at: row.publishedAt,
        read: Boolean(row.read),
        starred: Boolean(row.starred),
      }));
    },

    async patchItem(id: number, patch: { read?: boolean; starred?: boolean }) {
      const values: Record<string, number> = {};
      if (patch.read !== undefined) values.read = patch.read ? 1 : 0;
      if (patch.starred !== undefined) values.starred = patch.starred ? 1 : 0;
      if (Object.keys(values).length === 0) return { ok: true };
      await db.update(feedItem).set(values).where(eq(feedItem.id, id));
      return { ok: true };
    },
  };
}

export type FeedService = ReturnType<typeof createFeedService>;
