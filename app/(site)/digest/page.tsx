import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { buildDigest } from "@/server/modules/digest";
import type { DigestPayload } from "@/server/modules/digest";
import { loadSiteSettings } from "@/server/modules/site-settings";
import DigestClient from "./DigestClient";

export const revalidate = 60;

function requireModule(href: string): InterestModule {
  const entry = interestModuleByHref(href);
  if (!entry) throw new Error(`Missing interest module: ${href}`);
  return entry;
}

const MODULE = requireModule("/digest");

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildInterestMetadata({
    title: `${MODULE.pageTitle} · ${profile.siteTitle}`,
    description: MODULE.description,
    path: MODULE.href,
  });
}

export default async function DigestPage() {
  let digest: DigestPayload | null = null;
  let failed = false;
  try {
    digest = await buildDigest();
  } catch (error) {
    console.error("Failed to build digest", error);
    failed = true;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      {failed ? (
        <>
          <div className="mb-6">
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
              <Newspaper className="h-6 w-6 text-sky-500" />
              {MODULE.pageTitle}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">加载失败</p>
          </div>
          <AsyncState
            tone="error"
            title="简报加载失败"
            description="数据暂时取不到，点击下方按钮重新加载。"
            actionLabel="重新加载"
            actionHref="/digest"
          />
        </>
      ) : !digest ? (
        <AsyncState tone="loading" title="简报生成中…" description="正在汇总新闻、行情与比赛数据。" />
      ) : (
        <DigestClient initialDigest={digest} pageTitle={MODULE.pageTitle} />
      )}
    </div>
  );
}
