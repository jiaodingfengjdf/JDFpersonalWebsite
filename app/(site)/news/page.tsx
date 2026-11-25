import type { Metadata } from "next";
import { getAdminSession } from "@/server/auth/guard";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { loadSiteSettings } from "@/server/modules/site-settings";
import NewsClient from "./NewsClient";

export const dynamic = "force-dynamic";

function requireModule(href: string): InterestModule {
  const entry = interestModuleByHref(href);
  if (!entry) throw new Error(`Missing interest module: ${href}`);
  return entry;
}

const MODULE = requireModule("/news");

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildInterestMetadata({
    title: `${MODULE.pageTitle} · ${profile.siteTitle}`,
    description: MODULE.description,
    path: MODULE.href,
    indexable: MODULE.indexable,
  });
}

export default async function NewsPage() {
  const admin = await getAdminSession();
  return <NewsClient canManage={Boolean(admin)} />;
}
