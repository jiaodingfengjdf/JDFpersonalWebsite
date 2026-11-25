import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/page-metadata";
import { getCategoriesService } from "@/server/modules/categories";
import { getPostsService } from "@/server/modules/posts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import PostsClient from "./PostsClient";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();

  return buildPageMetadata({
    title: `文章 · ${profile.siteTitle}`,
    description: "记录技术探索、学术研究与生活感悟",
    path: "/posts",
  });
}

const PAGE_SIZE = 12;

export default async function PostsPage() {
  const [categories, posts] = await Promise.all([
    getCategoriesService()
      .list()
      .catch((error) => {
        console.error("Failed to load post categories", error);
        return [];
      }),
    getPostsService()
      .list({ status: "published", page: 1, size: PAGE_SIZE })
      .catch((error) => {
        console.error("Failed to load posts", error);
        return [];
      }),
  ]);

  return (
    <PostsClient initialCategories={categories} initialPosts={posts} />
  );
}
