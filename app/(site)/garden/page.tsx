import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";
import { loadSiteSettings } from "@/server/modules/site-settings";
import GardenClient from "./GardenClient";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildPageMetadata({
    title: `仪表盘 · ${profile.siteTitle}`,
    description: "星港数据概览：站点运行天数、文章/说说/项目/照片统计与发布趋势。",
    path: "/garden",
    // app/robots.ts 已 disallow /garden（密码门禁区，未解锁时 SSR 为空壳）
    indexable: false,
  });
}

export default function GardenPage() {
  return <GardenClient />;
}
