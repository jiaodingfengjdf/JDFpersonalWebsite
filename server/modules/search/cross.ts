import "server-only";
import { like, or } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { collectionItem, feedItem, gameItem, libraryBook, watchItem } from "@/server/db/schema";

export interface CrossHit {
  kind: "collection" | "book" | "watch" | "game" | "news";
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
};

const LIMIT = 8;

/** 跨模块关键词搜索：收藏 / 书架 / 影视 / 游戏 / 新闻标题。 */
export async function searchCross(db: AppDatabase, query: string): Promise<CrossResult> {
  const keyword = `%${query}%`;
  const hits: CrossHit[] = [];

  const collections = await db
    .select()
    .from(collectionItem)
    .where(or(like(collectionItem.title, keyword), like(collectionItem.note, keyword)))
    .limit(LIMIT);
  for (const item of collections) {
    hits.push({
      kind: "collection",
      title: item.title,
      detail: [item.kind, item.author, item.note].filter(Boolean).join(" · ").slice(0, 120),
      href: "/bookmark",
      updated_at: item.updatedAt?.getTime() ?? 0,
    });
  }

  const books = await db
    .select()
    .from(libraryBook)
    .where(or(like(libraryBook.title, keyword), like(libraryBook.author, keyword)))
    .limit(LIMIT);
  for (const item of books) {
    hits.push({
      kind: "book",
      title: item.title,
      detail: [item.author, item.format.toUpperCase()].filter(Boolean).join(" · "),
      href: `/library/${item.id}`,
      updated_at: item.updatedAt?.getTime() ?? 0,
    });
  }

  const watches = await db
    .select()
    .from(watchItem)
    .where(or(like(watchItem.title, keyword), like(watchItem.note, keyword)))
    .limit(LIMIT);
  for (const item of watches) {
    hits.push({
      kind: "watch",
      title: item.title,
      detail: [item.year, item.note].filter(Boolean).join(" · ").slice(0, 120),
      href: "/watch",
      updated_at: item.updatedAt?.getTime() ?? 0,
    });
  }

  const games = await db
    .select()
    .from(gameItem)
    .where(or(like(gameItem.title, keyword), like(gameItem.note, keyword)))
    .limit(LIMIT);
  for (const item of games) {
    hits.push({
      kind: "game",
      title: item.title,
      detail: [item.platform, `${item.hours}h`].filter(Boolean).join(" · "),
      href: "/games",
      updated_at: item.updatedAt?.getTime() ?? 0,
    });
  }

  const news = await db
    .select()
    .from(feedItem)
    .where(like(feedItem.title, keyword))
    .limit(LIMIT);
  for (const item of news) {
    hits.push({
      kind: "news",
      title: item.title,
      detail: new Date(item.publishedAt).toLocaleDateString("zh-CN"),
      href: item.link || "/news",
      updated_at: item.publishedAt,
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
