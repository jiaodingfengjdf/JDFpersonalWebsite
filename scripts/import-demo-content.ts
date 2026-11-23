/**
 * 将 content/posts/*.md 的 Markdown 正文和 frontmatter 导入 SQLite。
 * 按 slug 去重，可传 --force 更新已有文章。
 * 用法：pnpm exec tsx scripts/import-demo-content.ts [--force]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { openDatabase } from "../server/db/open";
import * as schema from "../server/db/schema";

const { post, postTag, postRevision, category, tag } = schema;

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
const stats = { posts: 0, skippedPosts: 0 };

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

}

async function main(): Promise<void> {
  console.log(`数据库：${dbPath}`);
  console.log("· 导入 content/posts/*.md");
  await importMarkdownPosts();
  await recomputeCounts();

  const [counts] = await db
    .select({
      posts: sql<number>`(SELECT count(*) FROM post)`,
      published: sql<number>`(SELECT count(*) FROM post WHERE status = 'published')`,
      categories: sql<number>`(SELECT count(*) FROM category)`,
      tags: sql<number>`(SELECT count(*) FROM tag)`,
    })
    .from(sql`(SELECT 1)`);

  console.log("\n导入结果：", {
    新增文章: stats.posts,
    跳过已存在: stats.skippedPosts,
  });
  console.log("库内统计：", counts);
}

main().catch((error) => {
  console.error("导入失败：", error);
  process.exitCode = 1;
}).finally(() => connection.close());
