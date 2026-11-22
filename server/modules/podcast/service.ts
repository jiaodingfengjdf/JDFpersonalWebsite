import { desc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { podcastEpisode, podcastShow } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import type { PodcastEpisodeView, PodcastShowView } from "./contracts";
import { fetchPodcast } from "./provider";

const MAX_EPISODES = 60;

export function createPodcastService(db: AppDatabase) {
  async function refreshShow(showId: number, feedUrl: string): Promise<number> {
    try {
      const parsed = await fetchPodcast(feedUrl);
      const now = new Date();
      await db
        .update(podcastShow)
        .set({
          title: parsed.title,
          author: parsed.author,
          cover: parsed.cover,
          description: parsed.description,
          lastCheckedAt: Date.now(),
          lastError: "",
        })
        .where(eq(podcastShow.id, showId));

      let inserted = 0;
      for (const episode of parsed.episodes.slice(0, MAX_EPISODES)) {
        const result = await db
          .insert(podcastEpisode)
          .values({
            showId,
            guid: episode.guid.slice(0, 500),
            title: episode.title.slice(0, 300),
            audioUrl: episode.audioUrl.slice(0, 1000),
            duration: episode.duration,
            publishedAt: episode.publishedAt,
            description: episode.description,
            createdAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: podcastEpisode.id });
        if (result.length > 0) inserted += 1;
      }
      return inserted;
    } catch (error) {
      await db
        .update(podcastShow)
        .set({
          lastCheckedAt: Date.now(),
          lastError: error instanceof Error ? error.message.slice(0, 200) : "抓取失败",
        })
        .where(eq(podcastShow.id, showId));
      return 0;
    }
  }

  return {
    async shows(): Promise<PodcastShowView[]> {
      const rows = await db
        .select({
          id: podcastShow.id,
          title: podcastShow.title,
          author: podcastShow.author,
          cover: podcastShow.cover,
          description: podcastShow.description,
          feedUrl: podcastShow.feedUrl,
          lastCheckedAt: podcastShow.lastCheckedAt,
          lastError: podcastShow.lastError,
          count: sql<number>`(select count(*) from podcast_episode where podcast_episode.show_id = podcast_show.id)`,
        })
        .from(podcastShow)
        .orderBy(podcastShow.id);

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        cover: row.cover,
        description: row.description,
        feed_url: row.feedUrl,
        episode_count: row.count,
        last_checked_at: row.lastCheckedAt,
        last_error: row.lastError,
      }));
    },

    async episodes(showId: number, limit = 30): Promise<PodcastEpisodeView[]> {
      const rows = await db
        .select()
        .from(podcastEpisode)
        .where(eq(podcastEpisode.showId, showId))
        .orderBy(desc(podcastEpisode.publishedAt))
        .limit(limit);

      return rows.map((row) => ({
        id: row.id,
        show_id: row.showId,
        title: row.title,
        audio_url: row.audioUrl,
        duration: row.duration,
        published_at: row.publishedAt,
        description: row.description,
        played: Boolean(row.played),
        position: row.position,
      }));
    },

    async addShow(feedUrl: string): Promise<{ id: number; inserted: number }> {
      const now = new Date();
      const [row] = await db
        .insert(podcastShow)
        .values({ title: feedUrl, feedUrl, createdAt: now })
        .onConflictDoNothing()
        .returning({ id: podcastShow.id });
      if (!row) throw errors.badRequest("这个节目已经订阅了");
      const inserted = await refreshShow(row.id, feedUrl);
      return { id: row.id, inserted };
    },

    async refresh(showId: number): Promise<{ inserted: number }> {
      const [show] = await db
        .select()
        .from(podcastShow)
        .where(eq(podcastShow.id, showId))
        .limit(1);
      if (!show) throw errors.notFound("节目不存在");
      return { inserted: await refreshShow(showId, show.feedUrl) };
    },

    async refreshAll(): Promise<{ shows: number; inserted: number }> {
      const shows = await db.select().from(podcastShow);
      let inserted = 0;
      for (const show of shows) inserted += await refreshShow(show.id, show.feedUrl);
      return { shows: shows.length, inserted };
    },

    async removeShow(id: number) {
      await db.delete(podcastShow).where(eq(podcastShow.id, id));
      return { ok: true };
    },

    async savePosition(id: number, position: number, played: boolean) {
      await db
        .update(podcastEpisode)
        .set({ position, played: played ? 1 : 0 })
        .where(eq(podcastEpisode.id, id));
      return { ok: true };
    },
  };
}

export type PodcastService = ReturnType<typeof createPodcastService>;
