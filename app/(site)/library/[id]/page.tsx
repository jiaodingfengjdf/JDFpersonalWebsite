import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminSession } from "@/server/auth/guard";
import { getLibraryService } from "@/server/modules/library";
import { loadSiteSettings } from "@/server/modules/site-settings";
import Reader from "./Reader";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  try {
    const book = await getLibraryService().get(Number((await params).id));
    return { title: `${book.title} · ${profile.siteTitle}` };
  } catch {
    return { title: `阅读 · ${profile.siteTitle}` };
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

  return <Reader book={book} canPersist={Boolean(admin)} />;
}
