/**
 * 把仓库自带的演示内容导入 SQLite：
 *   1. content/posts/*.md          → post（含 frontmatter 的标题/分类/标签/发布时间）
 *   2. data/posts.ts               → post（元数据 + 由摘要生成的占位正文）
 *   3. data/moments.ts             → chatter（说说）
 *   4. data/chatters.ts            → chatter（旧版标题+摘要）
 *   5. data/photos.ts              → album + photo（按日期分相册，本地 /images/*.webp）
 *   6. data/albums.ts              → album + photo（远程演示图）
 *
 * 幂等：按 slug / 标题 / 正文去重，重复执行只补缺，不重复插入。
 * 用法：npx tsx scripts/import-demo-content.ts [--force]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { openDatabase } from "../server/db/open";
import * as schema from "../server/db/schema";
import { postsData } from "../data/posts";
import { momentsData } from "../data/moments";
import { chattersData } from "../data/chatters";
import { photoDays } from "../data/photos";
import { albums } from "../data/albums";

const { post, postTag, postRevision, category, tag, chatter, album, photo } = schema;

/** CLI 脚本只读 shell 环境；与 seed-admin 一致，只补 DATABASE_PATH。 */
function loadDatabasePathFromEnv(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  const envFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    ".env.local",
  );
  if (fs.existsSync(envFile)) {
    for (const raw of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const match = /^\s*DATABASE_PATH\s*=\s*(.*)$/.exec(raw);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return "./data/kirameku.db";
}

const dbPath = path.resolve(loadDatabasePathFromEnv());
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const connection = openDatabase(dbPath);
const db = drizzle(connection, { schema });

const force = process.argv.includes("--force");
const stats = { posts: 0, skippedPosts: 0, chatters: 0, albums: 0, photos: 0 };

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[/?#&%]+/g, "-");
}

function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base || "item";
  let index = 2;
  while (taken.has(slug)) {
    slug = `${base}-${index}`;
    index += 1;
  }
  taken.add(slug);
  return slug;
}

async function ensureCategory(name: string): Promise<number | null> {
  if (!name) return null;
  const [existing] = await db
    .select({ id: category.id })
    .from(category)
    .where(eq(category.name, name))
    .limit(1);
  if (existing) return existing.id;

  const taken = new Set(
    (await db.select({ slug: category.slug }).from(category)).map((row) => row.slug),
  );
  const [row] = await db
    .insert(category)
    .values({ name, slug: uniqueSlug(slugify(name), taken) })
    .returning({ id: category.id });
  console.log(`  + 分类 ${name}`);
  return row?.id ?? null;
}

async function ensureTag(name: string): Promise<number> {
  const [existing] = await db
    .select({ id: tag.id })
    .from(tag)
    .where(eq(tag.name, name))
    .limit(1);
  if (existing) return existing.id;

  const taken = new Set(
    (await db.select({ slug: tag.slug }).from(tag)).map((row) => row.slug),
  );
  const [row] = await db
    .insert(tag)
    .values({ name, slug: uniqueSlug(slugify(name), taken) })
    .returning({ id: tag.id });
  return row!.id;
}

/** 本地封面：只从 public/images 里实际存在的文件取，避免引用不存在的图片 */
const localCovers = fs
  .readdirSync(path.resolve("public/images"))
  .filter((file) => /\.(webp|jpg|jpeg|png)$/i.test(file) && file !== "default-cover.jpg")
  .sort()
  .map((file) => `/images/${file}`);

if (localCovers.length === 0) localCovers.push("/images/default-cover.jpg");

async function upsertPost(input: {
  title: string;
  slug: string;
  description: string;
  content: string;
  cover: string;
  categoryName: string;
  tags: string[];
  status: string;
  isPinned: boolean;
  publishedAt: Date;
}): Promise<void> {
  const [existing] = await db
    .select({ id: post.id })
    .from(post)
    .where(eq(post.slug, input.slug))
    .limit(1);

  if (existing && !force) {
    stats.skippedPosts += 1;
    return;
  }

  const categoryId = await ensureCategory(input.categoryName);
  const wordCount = input.content.length;
  const readingTime = wordCount > 0 ? Math.max(1, Math.floor(wordCount / 300)) : 0;

  let postId = existing?.id;
  if (existing) {
    await db
      .update(post)
      .set({
        title: input.title,
        description: input.description,
        content: input.content,
        cover: input.cover,
        categoryId,
        status: input.status,
        isPinned: input.isPinned,
        wordCount,
        readingTime,
        publishedAt: input.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(post.id, existing.id));
  } else {
    const [row] = await db
      .insert(post)
      .values({
        title: input.title,
        slug: input.slug,
        description: input.description,
        content: input.content,
        cover: input.cover,
        categoryId,
        status: input.status,
        isPinned: input.isPinned,
        wordCount,
        readingTime,
        publishedAt: input.publishedAt,
        createdAt: input.publishedAt,
        updatedAt: input.publishedAt,
      })
      .returning({ id: post.id });
    postId = row!.id;
  }

  await db.delete(postTag).where(eq(postTag.postId, postId!));
  for (const name of [...new Set(input.tags.map((item) => item.trim()).filter(Boolean))]) {
    const tagId = await ensureTag(name);
    await db.insert(postTag).values({ postId: postId!, tagId }).onConflictDoNothing();
  }

  await db.insert(postRevision).values({
    postId: postId!,
    snapshot: {
      title: input.title,
      slug: input.slug,
      description: input.description,
      content: input.content,
      cover: input.cover,
      category: input.categoryName,
      tags: input.tags,
      status: input.status,
      source: "import-demo-content",
    },
    createdAt: new Date(),
  });

  stats.posts += 1;
}

async function importMarkdownPosts(): Promise<void> {
  const dir = path.resolve("content/posts");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".md"));

  let coverIndex = 0;
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const { data, content } = matter(raw);
    const title = String(data.title ?? file.replace(/\.md$/, ""));
    const publishedAt = new Date(
      String(data.published_at ?? data.date ?? new Date().toISOString()),
    );

    // 默认封面图自带品牌字样，与卡片标题叠在一起很吵；改用本地实拍图轮换
    const declaredCover = String(data.cover ?? "");
    const cover =
      !declaredCover || declaredCover.includes("default-cover")
        ? (localCovers[coverIndex++ % localCovers.length] ?? "/images/default-cover.jpg")
        : declaredCover;

    await upsertPost({
      title,
      slug: String(data.slug ?? file.replace(/\.md$/, "")),
      description: String(data.description ?? ""),
      content,
      cover,
      categoryName: String(data.category ?? ""),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      status: String(data.status ?? "published"),
      isPinned: Boolean(data.is_pinned),
      publishedAt,
    });
    console.log(`· markdown ${file} → ${data.slug ?? file}（封面 ${cover}）`);
  }
}

async function importDemoPosts(): Promise<void> {
  let index = 0;
  for (const demo of postsData) {
    const cover = demo.cover.startsWith("https://picsum.photos")
      ? localCovers[index % localCovers.length]!
      : demo.cover;
    const body = [
      `## ${demo.title}`,
      "",
      demo.description,
      "",
      "> 这是仓库自带的演示文章：正文由 `data/posts.ts` 的摘要生成，可在后台补充完整内容。",
      "",
      "### 相关标签",
      "",
      ...demo.tags.map((name: string) => `- ${name}`),
    ].join("\n");

    await upsertPost({
      title: demo.title,
      slug: demo.slug,
      description: demo.description,
      content: body,
      cover,
      categoryName: demo.category,
      tags: demo.tags,
      status: "published",
      isPinned: false,
      publishedAt: new Date(demo.date),
    });
    index += 1;
  }
}

async function importChatters(): Promise<void> {
  const existing = await db.select({ content: chatter.content }).from(chatter);
  const seen = new Set(existing.map((row) => row.content));

  for (const moment of momentsData) {
    if (seen.has(moment.content)) continue;
    await db.insert(chatter).values({
      content: moment.content,
      images: JSON.stringify(moment.images ?? []),
      mood: moment.mood ?? "",
      likes: moment.likes ?? 0,
      status: "published",
      createdAt: new Date(moment.created_at),
      updatedAt: new Date(moment.created_at),
    });
    seen.add(moment.content);
    stats.chatters += 1;
  }

  for (const old of chattersData) {
    const content = `**${old.title}**\n\n${old.description}`;
    if (seen.has(content)) continue;
    await db.insert(chatter).values({
      content,
      images: "[]",
      mood: "",
      likes: 0,
      status: "published",
      createdAt: new Date(old.date),
      updatedAt: new Date(old.date),
    });
    seen.add(content);
    stats.chatters += 1;
  }
}

async function importAlbums(): Promise<void> {
  const existing = new Set(
    (await db.select({ title: album.title }).from(album)).map((row) => row.title),
  );

  const insertAlbum = async (input: {
    title: string;
    description: string;
    cover: string;
    createdAt: Date;
    photos: Array<{ url: string; caption?: string; orientation?: string }>;
  }) => {
    if (existing.has(input.title)) return;
    const [row] = await db
      .insert(album)
      .values({
        title: input.title,
        description: input.description,
        cover: input.cover,
        photoCount: input.photos.length,
        sort: 0,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
      .returning({ id: album.id });

    let sort = 0;
    for (const item of input.photos) {
      await db.insert(photo).values({
        albumId: row!.id,
        url: item.url,
        caption: item.caption ?? "",
        orientation: item.orientation ?? "landscape",
        sort: sort++,
        createdAt: input.createdAt,
      });
      stats.photos += 1;
    }
    existing.add(input.title);
    stats.albums += 1;
  };

  for (const day of photoDays) {
    await insertAlbum({
      title: day.label,
      description: `${day.date} 拍摄`,
      cover: day.photos[0]?.url ?? "",
      createdAt: new Date(`${day.date}T12:00:00`),
      photos: day.photos.map((item) => ({
        url: item.url,
        caption: item.caption,
        orientation: item.orientation,
      })),
    });
  }

  for (const item of albums) {
    await insertAlbum({
      title: item.title,
      description: item.description,
      cover: item.cover,
      createdAt: new Date(`${item.date.replace(/[^0-9]/g, "-").replace(/-$/, "")}-01T12:00:00`),
      photos: item.photos.map((entry) => ({ url: entry.url, caption: entry.caption })),
    });
  }
}

async function recomputeCounts(): Promise<void> {
  await db.run(sql`
    UPDATE category SET post_count = (
      SELECT count(*) FROM post
      WHERE post.category_id = category.id AND post.status = 'published'
    )
  `);
  await db.run(sql`
    UPDATE tag SET post_count = (
      SELECT count(*) FROM post_tag
      JOIN post ON post.id = post_tag.post_id
      WHERE post_tag.tag_id = tag.id AND post.status = 'published'
    )
  `);
  await db.run(sql`
    UPDATE album SET photo_count = (
      SELECT count(*) FROM photo WHERE photo.album_id = album.id
    )
  `);
}

async function main(): Promise<void> {
  console.log(`数据库：${dbPath}`);
  console.log("· 导入 content/posts/*.md");
  await importMarkdownPosts();
  console.log("· 导入 data/posts.ts 演示文章");
  await importDemoPosts();
  console.log("· 导入说说 data/moments.ts + data/chatters.ts");
  await importChatters();
  console.log("· 导入相册 data/photos.ts + data/albums.ts");
  await importAlbums();
  await recomputeCounts();

  const [counts] = await db
    .select({
      posts: sql<number>`(SELECT count(*) FROM post)`,
      published: sql<number>`(SELECT count(*) FROM post WHERE status = 'published')`,
      categories: sql<number>`(SELECT count(*) FROM category)`,
      tags: sql<number>`(SELECT count(*) FROM tag)`,
      chatters: sql<number>`(SELECT count(*) FROM chatter)`,
      albums: sql<number>`(SELECT count(*) FROM album)`,
      photos: sql<number>`(SELECT count(*) FROM photo)`,
    })
    .from(sql`(SELECT 1)`);

  console.log("\n导入结果：", {
    新增文章: stats.posts,
    跳过已存在: stats.skippedPosts,
    新增说说: stats.chatters,
    新增相册: stats.albums,
    新增照片: stats.photos,
  });
  console.log("库内统计：", counts);
  connection.close();
}

main().catch((error) => {
  console.error("导入失败：", error);
  process.exit(1);
});
