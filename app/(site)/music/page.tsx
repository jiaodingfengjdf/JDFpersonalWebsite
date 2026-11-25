import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";
import { loadSiteSettings } from "@/server/modules/site-settings";
import MusicClient from "./MusicClient";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildPageMetadata({
    title: `音乐 · ${profile.siteTitle}`,
    description: "站内云音乐播放器：在线听歌、查看歌词、切换歌单与播放模式。",
    path: "/music",
  });
}

export default function MusicPage() {
  return <MusicClient />;
}
