import type { Metadata } from "next";
import { Suspense } from "react";
import { getAdminSession } from "@/server/auth/guard";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { loadSiteSettings } from "@/server/modules/site-settings";
import PodcastClient from "./PodcastClient";

export const dynamic = "force-dynamic";

function requireModule(href: string): InterestModule {
  const entry = interestModuleByHref(href);
  if (!entry) throw new Error(`Missing interest module: ${href}`);
  return entry;
}

const MODULE = requireModule("/podcast");

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildInterestMetadata({
    title: `${MODULE.pageTitle} · ${profile.siteTitle}`,
    description: MODULE.description,
    path: MODULE.href,
    indexable: MODULE.indexable,
  });
}

export default async function PodcastPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const admin = await getAdminSession();
  const show = Number((await searchParams).show);
  const initialShow = Number.isSafeInteger(show) && show > 0 ? show : undefined;
  return (
    <Suspense fallback={null}>
      <PodcastClient canManage={Boolean(admin)} initialShow={initialShow} />
    </Suspense>
  );
}
