import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";
import { loadSiteSettings } from "@/server/modules/site-settings";
import AssistantRuntime from "./AssistantRuntime";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildPageMetadata({
    title: `私人 AI 助理 · ${profile.siteTitle}`,
    description: "站内 AI 助理（DeepSeek）：对话、记忆与设置只保存在本机浏览器。",
    path: "/assistant",
  });
}

export default function AssistantPage() {
  return <AssistantRuntime />;
}
