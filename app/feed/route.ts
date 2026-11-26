import { NextResponse } from "next/server";
import { renderMarkdown } from "@/lib/markdown";
import { env } from "@/server/env";
import { getPostsService } from "@/server/modules/posts";
import type { PostDetail } from "@/server/modules/posts/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import { buildShareConfig, resolveSiteUrl } from "@/server/site";

// The channel <link> and <atom:link> are configuration, so this route must be
// rendered per request rather than prerendered with build-time placeholders.
export const dynamic = "force-dynamic";

function feedAuthor(authorName: string): string {
  const email = env.SITE_CONTACT_EMAIL;
  return email ? `${email} (${authorName})` : authorName;
}

export async function GET() {
  try {
    const [posts, settings] = await Promise.all([
      getPostsService().listForFeed(10),
      loadSiteSettings(),
    ]);

    const siteUrl = resolveSiteUrl(settings);
    const share = buildShareConfig(settings, siteUrl);
    const authorName = feedAuthor(settings.profile.authorName);

    const items = (
      await Promise.all(
        posts.map((post) => generateItem(post, siteUrl, authorName)),
      )
    ).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(share.title)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(share.description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/feed" rel="self" type="application/rss+xml"/>
    <generator>Next.js</generator>
${items}
  </channel>
</rss>`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error("RSS generation failed:", error);
    return new NextResponse("Failed to generate RSS feed", { status: 500 });
  }
}

async function generateItem(
  post: PostDetail,
  siteUrl: string,
  authorName: string,
): Promise<string> {
  const postUrl = `${siteUrl}/posts/${post.slug}`;
  const pubDate = post.published_at
    ? new Date(post.published_at).toUTCString()
    : new Date(post.created_at).toUTCString();

  const categories = post.tags
    .map((tag) => `      <category>${escapeXml(tag)}</category>`)
    .join("\n");

  let contentHtml = "";
  if (post.content) {
    try {
      contentHtml = await renderMarkdown(post.content);
    } catch {
      contentHtml = escapeXml(post.content);
    }
  }

  return `    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <description><![CDATA[${post.description || ""}]]></description>
      <content:encoded><![CDATA[${contentHtml}]]></content:encoded>
      <pubDate>${pubDate}</pubDate>
      <author>${escapeXml(authorName)}</author>${categories ? `\n${categories}` : ""}
    </item>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
