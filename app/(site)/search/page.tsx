import type { Metadata } from "next";
import { getSearchService } from "@/server/modules/search";
import { loadSiteSettings } from "@/server/modules/site-settings";
import type { SearchResult } from "@/lib/api/search";
import { getDb } from "@/server/db/client";
import { searchCross } from "@/server/modules/search/cross";
import SearchClient from "./SearchClient";

/** 搜索结果跟着关键词走，不缓存；同一进程内每次查询都要看最新文章。 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return {
    title: `搜索 · ${profile.siteTitle}`,
    description: "搜索站内文章、说说与兴趣内容",
    // 搜索结果页没有稳定的内容，不应当进索引。
    robots: { index: false, follow: true },
  };
}

const EMPTY: SearchResult = { query: "", total: 0, hits: [], fuzzy: false };

interface PageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const raw = Array.isArray(q) ? q[0] : q;
  const query = (raw ?? "").trim().slice(0, 100);

  const [articles, interest] = await Promise.allSettled([
    query ? getSearchService().search({ q: query, limit: 20 }) : Promise.resolve(EMPTY),
    query ? searchCross(getDb(), query) : Promise.resolve(null),
  ]);
  if (articles.status === "rejected") console.error("Failed to search posts", articles.reason);
  if (interest.status === "rejected") console.error("Failed to search interests", interest.reason);

  return (
    <SearchClient
      key={query}
      initialQuery={query}
      initialResult={articles.status === "fulfilled" ? articles.value : EMPTY}
      groups={interest.status === "fulfilled" ? interest.value?.groups ?? [] : []}
      incomplete={articles.status === "rejected" || interest.status === "rejected"}
    />
  );
}
