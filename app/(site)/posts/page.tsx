import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";
import { getCategoriesService } from "@/server/modules/categories";
import { getPostsService } from "@/server/modules/posts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import PostsClient, { type PostSortMode } from "./PostsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();

  return buildPageMetadata({
    title: `文章 · ${profile.siteTitle}`,
    description: "记录技术探索、学术研究与生活感悟",
    path: "/posts",
  });
}

const PAGE_SIZE = 12;
const FULL_FILTER_SIZE = 100;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return (value ?? "").trim();
}

function parseSort(value: string): PostSortMode {
  if (value === "views" || value === "likes") return value;
  return "latest";
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    category?: string | string[];
    q?: string | string[];
    tag?: string | string[];
    sort?: string | string[];
  }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const rawCategory = firstParam(resolvedParams.category).slice(0, 100);
  const initialQuery = firstParam(resolvedParams.q).slice(0, 100);
  const initialTag = firstParam(resolvedParams.tag).slice(0, 100) || null;
  const initialSort = parseSort(firstParam(resolvedParams.sort));

  const categories = await getCategoriesService()
    .list()
    .catch((error) => {
      console.error("Failed to load post categories", error);
      return [];
    });

  // 支持按分类 slug 或分类名称跳转（例如来自文章详情页的分类标签链接）
  const matchedCategory = rawCategory
    ? categories.find(
        (cat) =>
          cat.slug.toLowerCase() === rawCategory.toLowerCase() ||
          cat.name.toLowerCase() === rawCategory.toLowerCase(),
      )
    : undefined;
  const initialCategory = matchedCategory
    ? matchedCategory.slug
    : rawCategory || null;

  const needsFullBatch =
    Boolean(initialQuery) || Boolean(initialTag) || initialSort !== "latest";
  const fetchSize = needsFullBatch ? FULL_FILTER_SIZE : PAGE_SIZE;

  const { posts, initialError } = await getPostsService()
    .list({
      status: "published",
      page: 1,
      size: fetchSize,
      ...(initialCategory ? { category: initialCategory } : {}),
    })
    .then((items) => ({ posts: items, initialError: false }))
    .catch((error) => {
      console.error("Failed to load posts", error);
      return { posts: [], initialError: true };
    });

  return (
    <PostsClient
      initialCategories={categories}
      initialPosts={posts}
      initialCategory={initialCategory}
      initialTag={initialTag}
      initialQuery={initialQuery}
      initialSort={initialSort}
      initialFetchSize={fetchSize}
      initialError={initialError}
    />
  );
}
