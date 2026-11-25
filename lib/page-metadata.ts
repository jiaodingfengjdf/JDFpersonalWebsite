import type { Metadata } from "next";

/**
 * 站内页面的通用 metadata：canonical + OG + Twitter + robots。
 * path 为根相对路径，由根布局的 metadataBase 解析为完整 URL。
 */
export function buildPageMetadata(options: {
  title: string;
  description: string;
  path: string;
  indexable?: boolean;
}): Metadata {
  const { title, description, path, indexable = true } = options;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: indexable ? undefined : { index: false, follow: false },
    openGraph: {
      type: "website",
      title,
      description,
      url: path,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

/**
 * 兴趣栏目页面的统一 metadata。
 * 此前 10 个页面只有 title/description，分享出去没有独立标题与 canonical。
 */
export function buildInterestMetadata(options: {
  title: string;
  description: string;
  path: string;
  indexable?: boolean;
}): Metadata {
  return buildPageMetadata(options);
}
