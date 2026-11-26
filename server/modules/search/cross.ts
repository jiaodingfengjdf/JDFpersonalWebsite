import "server-only";
import { and, desc, eq, or, sql, type SQLWrapper } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import {
  chatter,
  collectionItem,
  feedItem,
  feedSource,
  gameItem,
  libraryBook,
  marketWatch,
  nbaGame,
  nbaTeam,
  podcastShow,
  watchItem,
} from "@/server/db/schema";
import { formatDate, formatDayTime } from "@/lib/format";

export interface CrossHit {
  kind: "collection" | "book" | "watch" | "game" | "news" | "moment" | "podcast" | "market" | "nba";
  /** 比赛用文本主键 gameId，其余模块用自增数字 id；调用方只把它当 React key。 */
  id: number | string;
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
  market: "行情",
  nba: "NBA",
};

const LIMIT = 8;

/** 后台与前台共用的比赛状态中文，和 /nba 页保持一致。 */
function nbaStatusText(status: string): string {
  return status === "final" ? "已结束" : status === "live" ? "进行中" : "未开始";
}

export async function searchCross(db: AppDatabase, query: string): Promise<CrossResult> {
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { query, total: 0, groups: [] };

  // 与文章搜索的 LIKE 兜底同语义：每个 token 在列间 OR，token 之间 AND。
  const matches = (...columns: SQLWrapper[]) =>
    and(
      ...tokens.map((token) => {
        const keyword = `%${token.replace(/[!%_]/g, "!$&")}%`;
        return or(...columns.map((column) => sql`${column} LIKE ${keyword} ESCAPE '!'`));
      }),
    );
  const hits: CrossHit[] = [];

  // 九个模块互不依赖，并发查询；解构顺序与下方写入顺序一致，保证结果稳定。
  const [collections, books, watches, games, news, moments, podcasts, markets, nbaTeams, nbaGames] = await Promise.all([
    db
      .select()
      .from(collectionItem)
      .where(and(eq(collectionItem.isPublic, 1), matches(collectionItem.title, collectionItem.author, collectionItem.note, collectionItem.tags)))
      .orderBy(desc(collectionItem.updatedAt), desc(collectionItem.id))
      .limit(LIMIT),
    db
      .select()
      .from(libraryBook)
      .where(matches(libraryBook.title, libraryBook.author, libraryBook.category, libraryBook.note))
      .orderBy(desc(libraryBook.updatedAt), desc(libraryBook.id))
      .limit(LIMIT),
    db
      .select()
      .from(watchItem)
      .where(matches(watchItem.title, watchItem.note))
      .orderBy(desc(watchItem.updatedAt), desc(watchItem.id))
      .limit(LIMIT),
    db
      .select()
      .from(gameItem)
      .where(matches(gameItem.title, gameItem.note))
      .orderBy(desc(gameItem.updatedAt), desc(gameItem.id))
      .limit(LIMIT),
    db
      .select({ id: feedItem.id, title: feedItem.title, link: feedItem.link, publishedAt: feedItem.publishedAt })
      .from(feedItem)
      .innerJoin(feedSource, eq(feedSource.id, feedItem.sourceId))
      .where(and(eq(feedSource.enabled, 1), matches(feedItem.title)))
      .orderBy(desc(feedItem.publishedAt), desc(feedItem.id))
      .limit(LIMIT),
    db
      .select({ id: chatter.id, content: chatter.content, updatedAt: chatter.updatedAt })
      .from(chatter)
      .where(and(eq(chatter.status, "published"), matches(chatter.content)))
      .orderBy(desc(chatter.updatedAt), desc(chatter.id))
      .limit(LIMIT),
    db
      .select({ id: podcastShow.id, title: podcastShow.title, author: podcastShow.author, createdAt: podcastShow.createdAt })
      .from(podcastShow)
      .where(matches(podcastShow.title, podcastShow.author))
      .orderBy(desc(podcastShow.createdAt), desc(podcastShow.id))
      .limit(LIMIT),
    db
      .select()
      .from(marketWatch)
      .where(matches(marketWatch.name, marketWatch.code))
      .orderBy(desc(marketWatch.updatedAt), desc(marketWatch.id))
      .limit(LIMIT),
    db
      .select()
      .from(nbaTeam)
      .where(matches(nbaTeam.nameZh, nbaTeam.nameEn, nbaTeam.code))
      .orderBy(desc(nbaTeam.id))
      .limit(LIMIT),
    db
      .select()
      .from(nbaGame)
      .where(matches(nbaGame.homeName, nbaGame.awayName))
      .orderBy(desc(nbaGame.startAt), desc(nbaGame.gameId))
      .limit(LIMIT),
  ]);

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

  for (const item of books) {
    hits.push({
      kind: "book",
      id: item.id,
      title: item.title,
      detail: [item.category, item.author, item.format.toUpperCase()].filter(Boolean).join(" · "),
      href: `/library/${item.id}`,
      updated_at: item.updatedAt?.getTime() ?? 0,
    });
  }

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

  for (const item of news) {
    hits.push({
      kind: "news",
      id: item.id,
      title: item.title,
      detail: formatDate(item.publishedAt),
      href: /^https?:\/\//i.test(item.link) ? item.link : "/news",
      updated_at: item.publishedAt,
    });
  }

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

  for (const item of markets) {
    hits.push({
      kind: "market",
      id: item.id,
      title: item.name || item.code,
      detail: [item.market === "us" ? "美股" : "A股", item.code].join(" · "),
      href: `/market?symbol=${item.id}`,
      updated_at: item.updatedAt?.getTime() ?? 0,
    });
  }

  // 球队与比赛合并成一个 NBA 分组，合并后仍受每组 8 条的上限约束。
  const nbaHits: CrossHit[] = [];
  for (const item of nbaTeams) {
    nbaHits.push({
      kind: "nba",
      id: item.id,
      title: item.nameZh || item.nameEn || item.code,
      detail: item.code,
      href: item.follow === 1 ? "/nba?follow=1" : "/nba",
      updated_at: 0,
    });
  }
  for (const item of nbaGames) {
    nbaHits.push({
      kind: "nba",
      id: item.gameId,
      title: `${item.awayName} @ ${item.homeName}`,
      detail: `${formatDayTime(item.startAt)} · ${nbaStatusText(item.status)}`,
      href: "/nba",
      updated_at: item.updatedAt,
    });
  }
  hits.push(...nbaHits.sort((a, b) => b.updated_at - a.updated_at).slice(0, LIMIT));

  const groups = (Object.keys(LABEL) as CrossHit["kind"][])
    .map((kind) => ({
      kind,
      label: LABEL[kind],
      items: hits.filter((hit) => hit.kind === kind).sort((a, b) => b.updated_at - a.updated_at),
    }))
    .filter((group) => group.items.length > 0);

  return { query, total: hits.length, groups };
}
