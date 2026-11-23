import "server-only";
import { and, desc, eq, or, sql, type SQLWrapper } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { chatter, collectionItem, feedItem, feedSource, gameItem, libraryBook, podcastShow, watchItem } from "@/server/db/schema";

export interface CrossHit {
  kind: "collection" | "book" | "watch" | "game" | "news" | "moment" | "podcast";
  id: number;
  title: string;
  detail: string;
  href: string;
  updated_at: number;
}

export interface CrossResult {
  query: string;
  total: number;
  groups: Array<{ kind: CrossHit["kind"]; label: string; items: CrossHit[] }>;
}

const LABEL: Record<CrossHit["kind"], string> = {
  collection: "收藏",
  book: "书架",
  watch: "影视",
  game: "游戏",
  news: "新闻",
  moment: "说说",
  podcast: "播客",
};

const LIMIT = 8;

export async function searchCross(db: AppDatabase, query: string): Promise<CrossResult> {
  const keyword = `%${query.replace(/[!%_]/g, "!$&")}%`;
  const matches = (...columns: SQLWrapper[]) =>
    or(...columns.map((column) => sql`${column} LIKE ${keyword} ESCAPE '!'`));
  const hits: CrossHit[] = [];

  const collections = await db
    .select()
    .from(collectionItem)
    .where(and(eq(collectionItem.isPublic, 1), matches(collectionItem.title, collectionItem.author, collectionItem.note, collectionItem.tags)))
    .orderBy(desc(collectionItem.updatedAt), desc(collectionItem.id))
    .limit(LIMIT);
  for (const item of collections) {
    hits.push({
      kind: "collection",
      id: item.id,
      title: item.title,
      detail: [item.kind, item.author, item.note].filter(Boolean).join(" · ").slice(0, 120),
      href: `/bookmark?q=${encodeURIComponent(item.title.slice(0, 100))}#collection-${item.id}`,
      updated_at: item.updatedAt?.getTime() ?? 0,
    });
  }

  const books = await db
    .select()
    .from(libraryBook)
    .where(matches(libraryBook.title, libraryBook.author))
    .orderBy(desc(libraryBook.updatedAt), desc(libraryBook.id))
    .limit(LIMIT);
  for (const item of books) {
    hits.push({
      kind: "book",
      id: item.id,
      title: item.title,
      detail: [item.author, item.format.toUpperCase()].filter(Boolean).join(" · "),
      href: `/library/${item.id}`,
      updated_at: item.updatedAt?.getTime() ?? 0,
    });
  }

  const watches = await db
    .select()
    .from(watchItem)
    .where(matches(watchItem.title, watchItem.note))
    .orderBy(desc(watchItem.updatedAt), desc(watchItem.id))
    .limit(LIMIT);
  for (const item of watches) {
    hits.push({
      kind: "watch",
      id: item.id,
      title: item.title,
      detail: [item.year, item.note].filter(Boolean).join(" · ").slice(0, 120),
      href: `/watch#watch-${item.id}`,
      updated_at: item.updatedAt?.getTime() ?? 0,
    });
  }

  const games = await db
    .select()
    .from(gameItem)
    .where(matches(gameItem.title, gameItem.note))
    .orderBy(desc(gameItem.updatedAt), desc(gameItem.id))
    .limit(LIMIT);
  for (const item of games) {
    hits.push({
      kind: "game",
      id: item.id,
      title: item.title,
      detail: [item.platform, `${item.hours}h`].filter(Boolean).join(" · "),
      href: `/games#game-${item.id}`,
      updated_at: item.updatedAt?.getTime() ?? 0,
    });
  }

  const news = await db
    .select({ id: feedItem.id, title: feedItem.title, link: feedItem.link, publishedAt: feedItem.publishedAt })
    .from(feedItem)
    .innerJoin(feedSource, eq(feedSource.id, feedItem.sourceId))
    .where(and(eq(feedSource.enabled, 1), matches(feedItem.title)))
    .orderBy(desc(feedItem.publishedAt), desc(feedItem.id))
    .limit(LIMIT);
  for (const item of news) {
    hits.push({
      kind: "news",
      id: item.id,
      title: item.title,
      detail: new Date(item.publishedAt).toLocaleDateString("zh-CN"),
      href: /^https?:\/\//i.test(item.link) ? item.link : "/news",
      updated_at: item.publishedAt,
    });
  }

  const moments = await db
    .select({ id: chatter.id, content: chatter.content, updatedAt: chatter.updatedAt })
    .from(chatter)
    .where(and(eq(chatter.status, "published"), matches(chatter.content)))
    .orderBy(desc(chatter.updatedAt), desc(chatter.id))
    .limit(LIMIT);
  for (const item of moments) {
    hits.push({
      kind: "moment",
      id: item.id,
      title: item.content.replace(/\s+/g, " ").slice(0, 90) || "说说",
      detail: "",
      href: `/moments?onlyView=${item.id}#moment-${item.id}`,
      updated_at: item.updatedAt?.getTime() ?? 0,
    });
  }

  const podcasts = await db
    .select({ id: podcastShow.id, title: podcastShow.title, author: podcastShow.author, createdAt: podcastShow.createdAt })
    .from(podcastShow)
    .where(matches(podcastShow.title, podcastShow.author))
    .orderBy(desc(podcastShow.createdAt), desc(podcastShow.id))
    .limit(LIMIT);
  for (const item of podcasts) {
    hits.push({
      kind: "podcast",
      id: item.id,
      title: item.title,
      detail: item.author,
      href: `/podcast?show=${item.id}`,
      updated_at: item.createdAt?.getTime() ?? 0,
    });
  }

  const groups = (Object.keys(LABEL) as CrossHit["kind"][])
    .map((kind) => ({
      kind,
      label: LABEL[kind],
      items: hits.filter((hit) => hit.kind === kind).sort((a, b) => b.updated_at - a.updated_at),
    }))
    .filter((group) => group.items.length > 0);

  return { query, total: hits.length, groups };
}
