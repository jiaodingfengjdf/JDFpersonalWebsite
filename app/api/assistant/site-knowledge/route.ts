import { z } from "zod";
import { requireAdmin } from "@/server/auth/guard";
import { handle } from "@/server/http/handler";
import { getCollectionService } from "@/server/modules/collection";
import { collectionQuery } from "@/server/modules/collection/contracts";
import { getFeedService } from "@/server/modules/feed";
import { getSearchService } from "@/server/modules/search";

export const dynamic = "force-dynamic";

/**
 * 站内知识问答（Phase 2）：只读、仅站长。
 * 聚合已发布文章、公开收藏与订阅新闻，返回最多 5 条带来源链接的结果，
 * 供助理的 site_search 工具调用。账本等私密数据不在此接口返回。
 */
const MAX_RESULTS = 5;
const SNIPPET_MAX = 200;

const siteKnowledgeQuery = z.object({
  q: z.string().trim().min(1, "请输入搜索关键词").max(100, "关键词太长了"),
  limit: z.coerce.number().int().min(1).max(MAX_RESULTS).default(MAX_RESULTS),
});

export type SiteKnowledgeKind = "post" | "collection" | "news";

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

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const query = siteKnowledgeQuery.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const limit = query.limit;

    const [posts, collection, news] = await Promise.all([
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

    const tokens = query.q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    for (const item of news) {
      const haystack = `${item.title} ${item.summary ?? ""}`.toLowerCase();
      if (!tokens.every((token) => haystack.includes(token))) continue;
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

    const response: SiteKnowledgeResponse = {
      query: query.q,
      total: results.length,
      results: results.slice(0, limit),
    };
    return response;
  }, { request });
}
