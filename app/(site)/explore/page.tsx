import type { Metadata } from "next";
import { loadSiteSettings } from "@/server/modules/site-settings";
import ExploreClient from "./ExploreClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return { title: `全局搜索 · ${profile.siteTitle}` };
}

export default function ExplorePage() {
  return <ExploreClient />;
}
