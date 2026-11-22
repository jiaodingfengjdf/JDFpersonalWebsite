import type { Metadata } from "next";
import { getCollectionService } from "@/server/modules/collection";
import { collectionQuery } from "@/server/modules/collection/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import CollectionClient from "./CollectionClient";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return {
    title: `收藏中心 · ${profile.siteTitle}`,
    description: "站点、影视、音乐、书、好物与灵感的统一收藏",
  };
}

export default async function BookmarkPage() {
  const service = getCollectionService();
  const params = collectionQuery.parse({});
  const [result, categories] = await Promise.all([
    service.list(params, { includePrivate: false }).catch((error) => {
      console.error("Failed to load collection", error);
      return { items: [], total: 0, counts: {} as Record<string, number> };
    }),
    service.categories().catch(() => []),
  ]);

  return (
    <CollectionClient items={result.items} counts={result.counts} categories={categories} />
  );
}
