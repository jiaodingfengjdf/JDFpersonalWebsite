import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ExplorePage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const query = Array.isArray(q) ? q[0] : q;
  redirect(query ? `/search?q=${encodeURIComponent(query.slice(0, 100))}` : "/search");
}
