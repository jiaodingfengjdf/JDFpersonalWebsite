import type { MetadataRoute } from "next";
import { INTEREST_MODULES } from "@/lib/interest-modules";
import { getSiteUrl } from "@/server/site";
import { getPostsService } from "@/server/modules/posts";

// Rendered per request on purpose: the absolute URLs come from SITE_URL /
// FRONTEND_ORIGIN, and a build-time prerender would bake the build placeholder
// (http://localhost:3000) into every <loc> for a whole revalidate window.
// The query is a single small SELECT, so the cost is negligible.
export const dynamic = "force-dynamic";

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/posts", changeFrequency: "weekly", priority: 0.9 },
  { path: "/moments", changeFrequency: "daily", priority: 0.8 },
  { path: "/bookmark", changeFrequency: "monthly", priority: 0.6 },
  { path: "/projects", changeFrequency: "monthly", priority: 0.7 },
  { path: "/photowall", changeFrequency: "monthly", priority: 0.7 },
  { path: "/timeline", changeFrequency: "monthly", priority: 0.7 },
  { path: "/music", changeFrequency: "monthly", priority: 0.5 },
  // 兴趣模块从单一事实来源派生：indexable=false 的 /ledger（私密）
  // 与 /search（查询页）自动排除，其余 8 页全部进入 sitemap。
  ...INTEREST_MODULES.filter((module) => module.indexable).map((module) => ({
    path: module.href,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  })),
  // /garden 需要密码才能进入，未解锁时服务端渲染的是空壳。
  // 收录它等于给爬虫一个永远空白的页面，所以不进 sitemap。
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await getSiteUrl();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${base}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  let postEntries: MetadataRoute.Sitemap = [];
  try {
    const posts = await getPostsService().listAllPublished();
    postEntries = posts.map((post) => ({
      url: `${base}/posts/${post.slug}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: "monthly",
      priority: 0.8,
    }));
  } catch (error) {
    console.error("Sitemap post query failed:", error);
  }

  return [...staticEntries, ...postEntries];
}
