import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";
import { getCollectionService } from "@/server/modules/collection";
import { collectionQuery } from "@/server/modules/collection/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import CollectionClient from "./CollectionClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildPageMetadata({
    title: `收藏中心 · ${profile.siteTitle}`,
    description: "站点、影视、音乐、书、好物与灵感的统一收藏",
    path: "/bookmark",
  });
}

export default async function BookmarkPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const service = getCollectionService();
  const raw = await searchParams;
  const params = collectionQuery.parse({
    kind: collectionQuery.shape.kind.safeParse(raw.kind).data,
    category: collectionQuery.shape.category.safeParse(raw.category).data,
    q: typeof raw.q === "string" ? raw.q.slice(0, 100) : undefined,
    tag: typeof raw.tag === "string" ? raw.tag.slice(0, 30) : undefined,
    page: collectionQuery.shape.page.safeParse(raw.page).data,
    size: 24,
  });
  const [result, categories] = await Promise.all([
    service.list(params, { includePrivate: false }).catch((error) => {
      console.error("Failed to load collection", error);
      return null;
    }),
    service.categories().catch(() => []),
  ]);

  return (
    <CollectionClient
      key={JSON.stringify(params)}
      items={result?.items ?? []}
      total={result?.total ?? 0}
      counts={result?.counts ?? {}}
      failed={!result}
      categories={categories}
      filters={params}
    />
  );
}
