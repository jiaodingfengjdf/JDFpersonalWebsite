import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";
import { loadSiteSettings } from "@/server/modules/site-settings";
import MessagesClient from "./MessagesClient";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildPageMetadata({
    title: `留言 · ${profile.siteTitle}`,
    description: "登录 GitHub，在留言板留下足迹，查看并回复其他访客的留言。",
    path: "/messages",
  });
}

export default function MessagesPage() {
  return <MessagesClient />;
}
