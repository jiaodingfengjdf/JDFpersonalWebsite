import { count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { chatter, comment, post, visitor } from "@/server/db/schema";

export const dashboardService = {
  async stats() {
    const db = getDb();
    const [
      [postRows],
      [commentRows],
      [chatterRows],
      [visitorRows],
      recentPosts,
    ] = await Promise.all([
      db
        .select({ value: count() })
        .from(post)
        .where(inArray(post.status, ["published", "unpublish_scheduled"])),
      db
        .select({ value: count() })
        .from(comment)
        .where(eq(comment.status, "approved")),
      db
        .select({ value: count() })
        .from(chatter)
        .where(eq(chatter.status, "published")),
      db.select({ value: count() }).from(visitor),
      db
        .select({
          id: post.id,
          title: post.title,
          status: post.status,
          views: post.views,
          publishedAt: post.publishedAt,
        })
        .from(post)
        .orderBy(desc(post.updatedAt), desc(post.id))
        .limit(5),
    ]);

    return {
      counts: {
        posts: postRows?.value ?? 0,
        approvedComments: commentRows?.value ?? 0,
        publishedChatters: chatterRows?.value ?? 0,
        visitors: visitorRows?.value ?? 0,
      },
      recentPosts,
    };
  },
};
