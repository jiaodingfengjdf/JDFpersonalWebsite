import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { renderMarkdownWithToc } from "@/lib/markdown";
import { AppError } from "@/server/http/errors";
import { getPostsService } from "@/server/modules/posts";
import {
  getShareConfig,
  getSiteUrl,
  shareImageUrl,
  siteUrl,
} from "@/server/site";
import PostDetailClient, { type AdjacentPostItem } from "./PostDetailClient";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

const getPost = cache(async (slug: string) => {
  return getPostsService().getBySlug(slug, { publishedOnly: true });
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const post = await getPost(slug);
    const base = await getSiteUrl();
    const url = siteUrl(`/posts/${post.slug}`, base);
    const share = await getShareConfig(
      {
        title: post.title,
        description: post.description,
        image: post.cover ? shareImageUrl(post.cover, base) : undefined,
      },
      base,
    );

    return {
      title: post.title,
      description: share.description,
      alternates: { canonical: url },
      openGraph: {
        type: "article",
        title: share.title,
        description: share.description,
        url,
        publishedTime: post.published_at ?? undefined,
        images: share.image ? [{ url: share.image }] : undefined,
      },
      twitter: {
        card: share.card,
        title: share.title,
        description: share.description,
        images: share.image ?? undefined,
      },
    };
  } catch {
    return {
      title: "文章不存在",
      robots: { index: false, follow: false },
    };
  }
}

export default async function PostDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const post = await getPost(slug).catch((error: unknown) => {
    if (error instanceof AppError && error.status === 404) {
      return null;
    }
    throw error;
  });

  if (!post) notFound();

  const { content, ...initialPost } = post;
  const [{ html: contentHtml, toc }, base, allPublished] = await Promise.all([
    renderMarkdownWithToc(content),
    getSiteUrl(),
    getPostsService()
      .list({ status: "published", page: 1, size: 100 })
      .catch(() => []),
  ]);

  // 按发布时间倒序排列计算相邻上下篇，避免置顶影响时间线顺序
  const chronological = [...allPublished].sort(
    (a, b) =>
      new Date(b.published_at ?? b.created_at).getTime() -
        new Date(a.published_at ?? a.created_at).getTime() || b.id - a.id,
  );
  const currentIdx = chronological.findIndex((item) => item.id === post.id);
  const toAdjacent = (
    item: (typeof chronological)[number] | undefined,
  ): AdjacentPostItem | null =>
    item
      ? {
          slug: item.slug,
          title: item.title,
          category: item.category,
          published_at: item.published_at ?? item.created_at,
        }
      : null;

  const prevPost = currentIdx > 0 ? toAdjacent(chronological[currentIdx - 1]) : null;
  const nextPost =
    currentIdx >= 0 && currentIdx < chronological.length - 1
      ? toAdjacent(chronological[currentIdx + 1])
      : null;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description || undefined,
    image: post.cover ? shareImageUrl(post.cover, base) : undefined,
    url: siteUrl(`/posts/${post.slug}`, base),
    mainEntityOfPage: siteUrl(`/posts/${post.slug}`, base),
    datePublished: post.published_at ?? post.created_at,
    dateModified: post.updated_at,
    ...(post.tags.length > 0 ? { keywords: post.tags.join(",") } : {}),
    ...(post.category ? { articleSection: post.category } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PostDetailClient
        key={post.slug}
        initialPost={initialPost}
        contentHtml={contentHtml}
        toc={toc}
        prevPost={prevPost}
        nextPost={nextPost}
      />
    </>
  );
}
