import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";
import { getAdminSession } from "@/server/auth/guard";
import { loadAssistantPublicConfig } from "@/server/modules/assistant";
import { loadSiteSettings } from "@/server/modules/site-settings";
import AssistantRuntime from "./AssistantRuntime";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [{ profile }, publicConfig] = await Promise.all([
    loadSiteSettings(),
    loadAssistantPublicConfig(),
  ]);
  const title = publicConfig.displayName || "私人 AI 助理";
  return buildPageMetadata({
    title: `${title} · ${profile.siteTitle}`,
    description:
      publicConfig.welcomeMessage ||
      "站内 AI 助理：支持深度思考、联网检索与文档解析，设置仅限站长管理。",
    path: "/assistant",
  });
}

export default async function AssistantPage() {
  const [admin, publicConfig] = await Promise.all([
    getAdminSession(),
    loadAssistantPublicConfig(),
  ]);

  return (
    <AssistantRuntime
      initialAuth={{
        isAdmin: Boolean(admin),
        adminUsername: admin?.username ?? null,
        authLoaded: true,
      }}
      initialPublicConfig={publicConfig}
    />
  );
}
