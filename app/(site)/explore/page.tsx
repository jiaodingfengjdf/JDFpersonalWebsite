import { permanentRedirect } from "next/navigation";

export default async function ExplorePage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const query = Array.isArray(q) ? q[0] : q;
  permanentRedirect(query ? `/search?q=${encodeURIComponent(query.slice(0, 100))}` : "/search");
}
