import { z } from "zod";
import { requireAdmin } from "@/server/auth/guard";
import { handle } from "@/server/http/handler";
import { getAlbumsService } from "@/server/modules/albums";
import { getBookmarksService } from "@/server/modules/bookmarks";
import { getChattersService } from "@/server/modules/chatters";
import { getCollectionService } from "@/server/modules/collection";
import { collectionQuery } from "@/server/modules/collection/contracts";
import { getFeedService } from "@/server/modules/feed";
import { getGamesService } from "@/server/modules/games";
import { getLibraryService } from "@/server/modules/library";
import { getMarketService } from "@/server/modules/market";
import { getPodcastService } from "@/server/modules/podcast";
import { getSearchService } from "@/server/modules/search";
import { getWatchService } from "@/server/modules/watch";

export const dynamic = "force-dynamic";

/**
 * 站内知识问答：只读、仅站长。
 * 聚合已发布文章、公开收藏、订阅新闻、书架、播客、游戏、影视、相册、
 * 书签、已发布碎碎念与自选行情，返回最多 5 条带来源链接的结果，
 * 供助理的 site_search 工具调用。账本等私密数据不在此接口返回。
 * 每个来源失败时当作空结果，不拖垮整条路由。
 */
const MAX_RESULTS = 5;
const SNIPPET_MAX = 200;

const siteKnowledgeQuery = z.object({
  q: z.string().trim().min(1, "请输入搜索关键词").max(100, "关键词太长了"),
  limit: z.coerce.number().int().min(1).max(MAX_RESULTS).default(MAX_RESULTS),
});

export type SiteKnowledgeKind =
  | "post"
  | "collection"
  | "news"
  | "library"
  | "podcast"
  | "game"
  | "watch"
  | "album"
  | "bookmark"
  | "chatter"
  | "market";

export interface SiteKnowledgeResult {
  kind: SiteKnowledgeKind;
  title: string;
  snippet: string;
  url: string;
  source?: string;
  published_at?: string | null;
}

export interface SiteKnowledgeResponse {
  query: string;
  /** 截断前的总命中数。 */
  total: number;
  results: SiteKnowledgeResult[];
}

function truncateSnippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > SNIPPET_MAX ? `${clean.slice(0, SNIPPET_MAX)}…` : clean;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** 关键词分词后必须全部出现在待查文本里（不分词语言下按子串匹配）。 */
function matchesTokens(haystack: string, tokens: string[]): boolean {
  const text = haystack.toLowerCase();
  return tokens.every((token) => text.includes(token));
}

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const query = siteKnowledgeQuery.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const limit = query.limit;
    const tokens = tokenize(query.q);

    const [posts, collection, news, library, podcasts, games, watch, albums, bookmarks, chatters, marketWatches] =
      await Promise.all([
        getSearchService()
          .search({ q: query.q, limit })
          .catch(() => ({ query: query.q, total: 0, hits: [], fuzzy: false })),
        getCollectionService()
          .list(collectionQuery.parse({ q: query.q, size: limit }), {
            includePrivate: false,
          })
          .catch(() => ({ items: [], total: 0, counts: {} })),
        getFeedService()
          .list({ limit: 20 })
          .catch(() => []),
        getLibraryService()
          .list()
          .catch(() => []),
        getPodcastService()
          .shows()
          .catch(() => []),
        getGamesService()
          .list()
          .catch(() => []),
        getWatchService()
          .list()
          .catch(() => []),
        getAlbumsService()
          .list()
          .catch(() => []),
        getBookmarksService()
          .listSites()
          .catch(() => []),
        getChattersService()
          .list({ status: "published", page: 1, size: 20 })
          .catch(() => []),
        getMarketService()
          .watches()
          .catch(() => []),
      ]);

    const results: SiteKnowledgeResult[] = [];

    for (const hit of posts.hits) {
      results.push({
        kind: "post",
        title: hit.title,
        snippet: truncateSnippet(hit.snippet || hit.description || ""),
        url: `/posts/${hit.slug}`,
        published_at: hit.published_at,
      });
    }

    for (const item of collection.items) {
      results.push({
        kind: "collection",
        title: item.title,
        snippet: truncateSnippet(item.note || item.author || ""),
        url: item.url,
        source: item.category_name || undefined,
      });
    }

    for (const item of news) {
      const haystack = `${item.title} ${item.summary ?? ""}`;
      if (!matchesTokens(haystack, tokens)) continue;
      results.push({
        kind: "news",
        title: item.title,
        snippet: truncateSnippet(item.summary || ""),
        url: item.link,
        source: item.source_name,
        published_at: item.published_at
          ? new Date(item.published_at).toISOString()
          : null,
      });
    }

    for (const book of library) {
      if (!matchesTokens(`${book.title} ${book.author} ${book.category} ${book.note}`, tokens)) continue;
      results.push({
        kind: "library",
        title: book.title,
        snippet: truncateSnippet(`${book.author}${book.note ? `：${book.note}` : ""}`),
        url: "/library",
        source: book.category || undefined,
      });
    }

    for (const show of podcasts) {
      if (!matchesTokens(`${show.title} ${show.author} ${show.description}`, tokens)) continue;
      results.push({
        kind: "podcast",
        title: show.title,
        snippet: truncateSnippet(show.description || show.author),
        url: "/podcast",
        source: show.author || undefined,
      });
    }

    for (const game of games) {
      if (!matchesTokens(`${game.title} ${game.platform} ${game.note}`, tokens)) continue;
      results.push({
        kind: "game",
        title: game.title,
        snippet: truncateSnippet(`${game.platform}${game.note ? ` · ${game.note}` : ""}`),
        url: "/games",
        source: game.platform || undefined,
      });
    }

    for (const item of watch) {
      if (!matchesTokens(`${item.title} ${item.overview} ${item.note}`, tokens)) continue;
      results.push({
        kind: "watch",
        title: item.title,
        snippet: truncateSnippet(item.overview || item.note || ""),
        url: "/watch",
        source: item.kind || undefined,
      });
    }

    for (const album of albums) {
      if (!matchesTokens(`${album.title} ${album.description}`, tokens)) continue;
      results.push({
        kind: "album",
        title: album.title,
        snippet: truncateSnippet(album.description || `${album.photo_count} 张照片`),
        url: "/photowall",
      });
    }

    for (const site of bookmarks) {
      if (!matchesTokens(`${site.name} ${site.url} ${site.description}`, tokens)) continue;
      results.push({
        kind: "bookmark",
        title: site.name,
        snippet: truncateSnippet(site.description || ""),
        url: site.url,
      });
    }

    for (const chatter of chatters) {
      if (!matchesTokens(`${chatter.content} ${chatter.mood}`, tokens)) continue;
      results.push({
        kind: "chatter",
        title: truncateSnippet(chatter.content),
        snippet: truncateSnippet(chatter.content),
        url: "/moments",
        source: chatter.mood || undefined,
        published_at: chatter.created_at ?? null,
      });
    }

    for (const item of marketWatches) {
      if (!matchesTokens(`${item.name} ${item.code}`, tokens)) continue;
      results.push({
        kind: "market",
        title: `${item.name}（${item.code}）`,
        snippet: `自选${item.kind === "fund" ? "基金" : item.kind === "index" ? "指数" : "股票"}`,
        url: "/market",
      });
    }

    const response: SiteKnowledgeResponse = {
      query: query.q,
      total: results.length,
      results: results.slice(0, limit),
    };
    return response;
  }, { request });
}
