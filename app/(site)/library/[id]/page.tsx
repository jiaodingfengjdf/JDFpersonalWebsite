import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { getAdminSession } from "@/server/auth/guard";
import { getLibraryService } from "@/server/modules/library";
import { loadSiteSettings } from "@/server/modules/site-settings";
import Reader from "./Reader";

export const dynamic = "force-dynamic";

function requireModule(href: string): InterestModule {
  const entry = interestModuleByHref(href);
  if (!entry) throw new Error(`Missing interest module: ${href}`);
  return entry;
}

const MODULE = requireModule("/library");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  const id = Number((await params).id);
  const path = `/library/${id}`;
  try {
    const book = await getLibraryService().get(id);
    return buildInterestMetadata({
      title: `${book.title} · ${profile.siteTitle}`,
      description: MODULE.description,
      path,
      indexable: MODULE.indexable,
    });
  } catch {
    return buildInterestMetadata({
      title: `阅读 · ${profile.siteTitle}`,
      description: MODULE.description,
      path,
      indexable: MODULE.indexable,
    });
  }
}

export default async function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const [book, admin] = await Promise.all([
    getLibraryService().get(id).catch(() => null),
    getAdminSession(),
  ]);
  if (!book) notFound();

  // 与 /api/podcast 隐私策略一致：非管理员不接收服务端保存的阅读进度。
  const safeBook = admin ? book : { ...book, progress: null };
  return <Reader book={safeBook} canPersist={Boolean(admin)} />;
}
