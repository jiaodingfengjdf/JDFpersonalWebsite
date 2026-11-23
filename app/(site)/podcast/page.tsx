import type { Metadata } from "next";
import { getAdminSession } from "@/server/auth/guard";
import { loadSiteSettings } from "@/server/modules/site-settings";
import PodcastClient from "./PodcastClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return { title: `播客 · ${profile.siteTitle}`, description: "订阅的播客与单集" };
}

export default async function PodcastPage({ searchParams }: {
  searchParams: Promise<{ show?: string }>;
}) {
  const admin = await getAdminSession();
  const show = Number((await searchParams).show);
  const initialShow = Number.isSafeInteger(show) && show > 0 ? show : undefined;
  return <PodcastClient key={initialShow ?? "all"} canManage={Boolean(admin)} initialShow={initialShow} />;
}
