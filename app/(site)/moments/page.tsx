import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";
import { getAdminSession } from "@/server/auth/guard";
import { getChattersService } from "@/server/modules/chatters";
import { loadSiteSettings } from "@/server/modules/site-settings";
import MomentsClient from "./MomentsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile, content } = await loadSiteSettings();
  const pageTitle = content.chatterTitle || "说说";
  const pageDesc = content.chatterDescription || "记录生活中的小确幸";

  return buildPageMetadata({
    title: `${pageTitle} · ${profile.siteTitle}`,
    description: pageDesc,
    path: "/moments",
  });
}

const PAGE_SIZE = 50;

export default async function MomentsPage({
  searchParams,
}: {
  searchParams: Promise<{ onlyView?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawOnlyView =
    typeof params.onlyView === "string" ? params.onlyView : null;
  const parsedOnlyView = rawOnlyView ? Number.parseInt(rawOnlyView, 10) : NaN;
  const initialOnlyView =
    Number.isInteger(parsedOnlyView) && parsedOnlyView > 0
      ? String(parsedOnlyView)
      : null;

  const service = getChattersService();
  const [chatters, totalCount, admin] = await Promise.all([
    service.list({
      status: "published",
      page: 1,
      size: PAGE_SIZE,
    }),
    service.count("published").catch(() => 0),
    getAdminSession(),
  ]);

  if (
    initialOnlyView &&
    !chatters.some((item) => String(item.id) === initialOnlyView)
  ) {
    const item = await service
      .getById(parsedOnlyView, { publishedOnly: true })
      .catch(() => null);
    if (item) chatters.push(item);
  }

  return (
    <MomentsClient
      initialChatters={chatters}
      initialTotal={Math.max(totalCount, chatters.length)}
      initialOnlyView={initialOnlyView}
      isAdmin={Boolean(admin)}
    />
  );
}
