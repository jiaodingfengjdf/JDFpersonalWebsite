import type { Metadata } from "next";
import { getAdminSession } from "@/server/auth/guard";
import { loadSiteSettings } from "@/server/modules/site-settings";
import NewsClient from "./NewsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return {
    title: `新闻流 · ${profile.siteTitle}`,
    description: "RSS 聚合：科技、国内、国际与设计",
  };
}

export default async function NewsPage() {
  const admin = await getAdminSession();
  return <NewsClient canManage={Boolean(admin)} />;
}
