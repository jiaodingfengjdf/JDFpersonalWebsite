"use client";
/* eslint-disable @next/next/no-img-element -- 图片地址来自后台配置或第三方接口，域名不可预知，按 lib/image.ts 的约定绕过 next/image 优化器 */

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FolderOpen,
  Heart,
  Share2,
  X,
} from "lucide-react";
import { likePost, reportPostView, type PostDetail } from "@/lib/api";
import ReadingProgress from "@/components/ui/ReadingProgress";
import { useToast } from "@/components/providers/ToastProvider";
import { bypassImageOptimization } from "@/lib/image";

const PostComments = dynamic(() => import("@/components/posts/PostComments"), {
  ssr: false,
});

/** 与服务端 lib/markdown.ts 的 TocEntry 同构；只在这里重声明，避免客户端模块拉进 server-only。 */
interface TocEntry {
  level: 2 | 3;
  id: string;
  text: string;
}

export interface AdjacentPostItem {
  slug: string;
  title: string;
  category: string;
  published_at: string | null;
}

export default function PostDetailClient({
  initialPost,
  contentHtml,
  toc = [],
  prevPost = null,
  nextPost = null,
}: {
  initialPost: Omit<PostDetail, "content">;
  contentHtml: string;
  toc?: TocEntry[];
  prevPost?: AdjacentPostItem | null;
  nextPost?: AdjacentPostItem | null;
}) {
  const { addToast } = useToast();
  const [post, setPost] = useState<Omit<PostDetail, "content">>(initialPost);
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<{
    src: string;
    caption: string;
  } | null>(null);
  const [resumePercent, setResumePercent] = useState<number | null>(null);

  const scrollStorageKey = `post-scroll-${post.slug}`;

  // Load local likes after hydration so server and client markup match.
  useEffect(() => {
    const saved = localStorage.getItem("liked_posts");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as number[];
      queueMicrotask(() => setLikedPosts(new Set(parsed)));
    } catch {
      localStorage.removeItem("liked_posts");
    }
  }, []);

  // 读取并持续记录阅读滚动进度（>15% 且 <92% 弹出可关闭续读提示，>95% 自动清除）
  useEffect(() => {
    let savedVal: number | null = null;
    try {
      const raw = localStorage.getItem(scrollStorageKey);
      if (raw) {
        const parsedNum = Number(raw);
        if (Number.isFinite(parsedNum) && parsedNum > 15 && parsedNum < 92) {
          savedVal = Math.round(parsedNum);
        } else {
          const parsedObj = JSON.parse(raw) as { percent?: unknown };
          if (
            typeof parsedObj?.percent === "number" &&
            parsedObj.percent > 15 &&
            parsedObj.percent < 92
          ) {
            savedVal = Math.round(parsedObj.percent);
          }
        }
      }
    } catch {
      // ignore invalid storage
    }

    if (savedVal !== null) {
      const targetPercent = savedVal;
      queueMicrotask(() => setResumePercent(targetPercent));
    }

    let userHasScrolled = false;
    const readyTimer = window.setTimeout(() => {
      userHasScrolled = true;
    }, 600);

    const handleScroll = () => {
      if (!userHasScrolled && window.scrollY < 40) return;
      userHasScrolled = true;

      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const percent = Math.min(100, Math.round((window.scrollY / docHeight) * 100));

      try {
        if (percent > 95) {
          localStorage.removeItem(scrollStorageKey);
          setResumePercent(null);
        } else if (percent > 15) {
          localStorage.setItem(scrollStorageKey, String(percent));
        }
      } catch {
        // ignore quota errors
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.clearTimeout(readyTimer);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [scrollStorageKey]);

  function handleResumeScroll() {
    if (resumePercent === null) return;
    const docHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight > 0) {
      window.scrollTo({
        top: (resumePercent / 100) * docHeight,
        behavior: "smooth",
      });
    }
    setResumePercent(null);
  }

  // 为代码块动态挂载语言角标与一键复制按钮
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const preBlocks = container.querySelectorAll("pre");
    const cleanups: Array<() => void> = [];

    preBlocks.forEach((pre) => {
      const preEl = pre as HTMLElement;
      const existing = preEl.querySelector(".post-code-toolbar");
      if (existing) existing.remove();

      preEl.style.position = "relative";

      const codeEl = preEl.querySelector("code");
      const langMatch = codeEl?.className.match(/language-([a-z0-9_+-]+)/i);
      const detectedLang = langMatch ? langMatch[1].toLowerCase() : "";

      const toolbar = document.createElement("div");
      toolbar.className = "post-code-toolbar";

      if (detectedLang) {
        const langBadge = document.createElement("span");
        langBadge.className = "post-code-lang";
        langBadge.textContent = detectedLang;
        toolbar.appendChild(langBadge);
      }

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "post-code-copy";
      copyBtn.textContent = "Copy";
      copyBtn.setAttribute("aria-label", "复制代码");

      let resetTimer: number | null = null;
      const onCopy = () => {
        const rawCode = codeEl?.textContent ?? "";
        void navigator.clipboard
          .writeText(rawCode)
          .then(() => {
            copyBtn.textContent = "已复制 ✓";
            copyBtn.dataset.copied = "true";
            if (resetTimer !== null) window.clearTimeout(resetTimer);
            resetTimer = window.setTimeout(() => {
              copyBtn.textContent = "Copy";
              delete copyBtn.dataset.copied;
            }, 2000);
          })
          .catch(() => {
            addToast("error", "复制代码失败，请手动选中复制");
          });
      };

      copyBtn.addEventListener("click", onCopy);
      toolbar.appendChild(copyBtn);
      preEl.appendChild(toolbar);

      cleanups.push(() => {
        if (resetTimer !== null) window.clearTimeout(resetTimer);
        copyBtn.removeEventListener("click", onCopy);
        toolbar.remove();
      });
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [contentHtml, addToast]);

  // Report the view once per browser per article per day.
  useEffect(() => {
    const key = "viewed_posts";
    const day = new Date().toISOString().slice(0, 10);
    let viewed: Record<string, string> = {};
    try {
      viewed = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<
        string,
        string
      >;
    } catch {
      viewed = {};
    }
    if (viewed[post.slug] === day) return;

    const next = { ...viewed, [post.slug]: day };
    localStorage.setItem(key, JSON.stringify(next));

    void reportPostView(post.id)
      .then(({ counted, views }) => {
        if (!counted || views === undefined) return;
        setPost((prev) => ({ ...prev, views }));
      })
      .catch(() => {
        // A failed view report must never break reading.
      });
  }, [post.slug, post.id]);

  // 灯箱键盘 Escape 关闭与滚动锁定
  useEffect(() => {
    if (!lightbox) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightbox(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [lightbox]);

  async function handleLike() {
    const alreadyLiked = likedPosts.has(post.id);
    try {
      const result = await likePost(post.id, alreadyLiked);
      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (alreadyLiked) next.delete(post.id);
        else next.add(post.id);
        localStorage.setItem("liked_posts", JSON.stringify([...next]));
        return next;
      });
      setPost((prev) => ({ ...prev, likes: result.likes }));
    } catch {
      addToast("error", "点赞操作失败，请稍后重试");
    }
  }

  async function handleShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      addToast("success", "本文链接已复制到剪贴板");
    } catch {
      addToast("error", "复制链接失败，请手动复制浏览器地址栏链接");
    }
  }

  // 事件委托：点击文章内容中的图片打开灯箱（支持图注展示）
  function handleContentClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      const img = target as HTMLImageElement;
      setLightbox({
        src: img.src,
        caption: (img.alt || img.title || "").trim(),
      });
    }
  }

  const dateStr = post.published_at
    ? new Date(post.published_at).toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const readingMinutes =
    post.reading_time > 0
      ? post.reading_time
      : post.word_count > 0
        ? Math.max(1, Math.ceil(post.word_count / 300))
        : Math.max(1, Math.ceil((post.description?.length || 200) / 120));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-12">
      <ReadingProgress contentRef={contentRef} />

      {/* 续读悬浮胶囊提示 */}
      <AnimatePresence>
        {resumePercent !== null && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed left-4 bottom-6 sm:left-6 z-[10001] flex items-center gap-2 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-sky-500/30 shadow-xl px-3.5 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200"
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <button
              type="button"
              onClick={handleResumeScroll}
              className="font-medium hover:text-sky-600 dark:hover:text-sky-400 transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 rounded"
            >
              上次读到 {resumePercent}% · <span className="text-sky-600 dark:text-sky-400 underline underline-offset-2">继续阅读</span>
            </button>
            <button
              type="button"
              aria-label="忽略续读提示"
              onClick={() => setResumePercent(null)}
              className="p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 返回按钮 */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          href="/posts"
          className="inline-flex items-center gap-1.5 text-sm md:text-base text-slate-600 dark:text-slate-300 hover:text-sky-500 dark:hover:text-sky-400 transition-colors mb-4 md:mb-8 rounded-lg focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <ArrowLeft className="w-3.5 h-3.5 md:w-4 md:h-4" />
          返回文章列表
        </Link>
      </motion.div>

      {/* 文章卡片（正文高底色不透明度提升可读性） */}
      <motion.article
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="rounded-3xl shadow-2xl overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/40 dark:border-white/10"
      >
        {/* 封面图 */}
        {post.cover && (
          <div className="relative w-full h-44 sm:h-60 md:h-76 overflow-hidden">
            <Image
              src={post.cover}
              alt={post.title}
              fill
              unoptimized={bypassImageOptimization(post.cover)}
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          </div>
        )}

        <div className="px-4 sm:px-6 md:px-12 py-5 sm:py-8 md:py-10">
          {/* 分类与标签导航药丸 */}
          {(post.category || post.tags.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
              {post.category && (
                <Link
                  href={`/posts?category=${encodeURIComponent(post.category)}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25 hover:bg-sky-500/25 transition-colors focus-visible:outline-2 focus-visible:outline-sky-500"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {post.category}
                </Link>
              )}
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/posts?tag=${encodeURIComponent(tag)}`}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100/90 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-white/10 hover:border-sky-400/50 hover:text-sky-600 dark:hover:text-sky-400 transition-colors focus-visible:outline-2 focus-visible:outline-sky-500"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          {/* 标题 */}
          <h1 className="text-xl sm:text-2xl md:text-4xl font-bold text-slate-900 dark:text-white leading-tight mb-3 md:mb-4">
            {post.title}
          </h1>

          {/* 描述 */}
          {post.description && (
            <p className="text-sm sm:text-base md:text-lg text-slate-600 dark:text-slate-300 mb-4 sm:mb-6 leading-relaxed">
              {post.description}
            </p>
          )}

          {/* 元信息 + 点赞 + 分享复制链接 */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-5 pb-5 sm:mb-8 sm:pb-8 border-b border-slate-200/70 dark:border-white/10">
            {dateStr && (
              <span
                className="flex items-center gap-1 sm:gap-1.5"
                suppressHydrationWarning
              >
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {dateStr}
              </span>
            )}
            <span className="flex items-center gap-1 sm:gap-1.5">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {readingMinutes} 分钟阅读
            </span>
            <span className="flex items-center gap-1 sm:gap-1.5">
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {post.views} 次浏览
            </span>
            <div className="flex items-center gap-3 sm:ml-auto">
              <button
                type="button"
                onClick={handleLike}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  likedPosts.has(post.id)
                    ? "bg-pink-500/10 border-pink-500/30 text-pink-600 dark:text-pink-400"
                    : "bg-slate-100/70 dark:bg-white/5 border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-pink-400/50 hover:text-pink-500"
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-all duration-300 ${
                    likedPosts.has(post.id) ? "fill-pink-500 scale-110" : ""
                  }`}
                />
                <span>{post.likes} 点赞</span>
              </button>

              <button
                type="button"
                onClick={handleShareLink}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border bg-slate-100/70 dark:bg-white/5 border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-sky-400/50 hover:text-sky-600 dark:hover:text-sky-400 transition-all focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>分享链接</span>
              </button>
            </div>
          </div>

          {/* 目录：标题少于两条时没有意义，直接不渲染 */}
          {toc.length >= 2 && (
            <nav
              aria-label="文章目录"
              className="mb-5 sm:mb-7 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3.5 dark:border-white/10 dark:bg-white/5"
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                目录
              </p>
              <ul className="space-y-1">
                {toc.map((entry) => (
                  <li
                    key={entry.id}
                    className={entry.level === 3 ? "pl-4" : undefined}
                  >
                    <a
                      href={`#${entry.id}`}
                      className="block truncate text-sm text-slate-600 transition-colors hover:text-sky-600 dark:text-slate-300 dark:hover:text-sky-400 rounded focus-visible:outline-2 focus-visible:outline-sky-500"
                    >
                      {entry.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* 文章内容 */}
          <div className="relative" ref={contentRef}>
            <style>{`
              .post-content :is(h1, h2, h3, h4) {
                scroll-margin-top: 5.5rem;
              }
              .post-content ul {
                list-style-type: disc !important;
                padding-left: 1.5rem !important;
                margin: 1rem 0 !important;
              }
              .post-content ol {
                list-style-type: decimal !important;
                padding-left: 1.5rem !important;
                margin: 1rem 0 !important;
              }
              .post-content li {
                margin: 0.25rem 0 !important;
                line-height: 1.75 !important;
              }
              .post-content pre {
                background-color: #1e293b !important;
                color: #e2e8f0 !important;
                padding: 2.4rem 1.25rem 1.25rem !important;
                border-radius: 0.875rem !important;
                overflow-x: auto !important;
                margin: 1.5rem 0 !important;
                border: 1px solid rgba(255,255,255,0.1) !important;
                font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace !important;
                line-height: 1.6 !important;
                white-space: pre !important;
                word-break: normal !important;
                overflow-wrap: normal !important;
              }
              .post-content pre code {
                background-color: transparent !important;
                padding: 0 !important;
                font-size: 0.9em !important;
                white-space: pre !important;
                word-break: normal !important;
                font-family: inherit !important;
              }
              .post-code-toolbar {
                position: absolute;
                top: 0.5rem;
                right: 0.65rem;
                display: inline-flex;
                align-items: center;
                gap: 0.4rem;
                z-index: 2;
              }
              .post-code-lang {
                font-size: 0.68rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #94a3b8;
                background: rgba(15, 23, 42, 0.55);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 0.375rem;
                padding: 0.12rem 0.45rem;
                user-select: none;
              }
              .post-code-copy {
                font-size: 0.72rem;
                font-weight: 500;
                color: #cbd5e1;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 0.45rem;
                padding: 0.16rem 0.55rem;
                cursor: pointer;
                transition: all 0.15s ease;
              }
              .post-code-copy:hover {
                background: rgba(14, 165, 233, 0.25);
                border-color: rgba(56, 189, 248, 0.5);
                color: #ffffff;
              }
              .post-code-copy:focus-visible {
                outline: 2px solid #0284c7;
                outline-offset: 2px;
              }
              .post-code-copy[data-copied="true"] {
                color: #6ee7b7;
                border-color: rgba(110, 231, 183, 0.45);
                background: rgba(16, 185, 129, 0.18);
              }
              .post-content code::before, .post-content code::after { content: none !important; }
              .post-content p code, .post-content li code {
                background-color: rgba(2,132,199,0.1) !important;
                color: #0284c7 !important;
                padding: 0.15rem 0.4rem !important;
                border-radius: 0.375rem !important;
                font-weight: 600 !important;
                font-size: 0.88em !important;
              }
              .dark .post-content p code, .dark .post-content li code {
                background-color: rgba(56,189,248,0.18) !important;
                color: #7dd3fc !important;
              }
              .post-content blockquote {
                border-left: 4px solid #0284c7 !important;
                padding-left: 1rem !important;
                margin: 1.5rem 0 !important;
                color: #475569 !important;
                font-style: italic !important;
              }
              .dark .post-content blockquote {
                color: #94a3b8 !important;
              }
              .post-content img {
                display: block !important;
                margin: 2rem auto !important;
                border-radius: 1rem !important;
                max-width: 100% !important;
                height: auto !important;
                cursor: zoom-in !important;
              }
              .post-content a {
                color: #0284c7 !important;
                text-decoration: underline !important;
                text-underline-offset: 3px !important;
              }
              .dark .post-content a {
                color: #38bdf8 !important;
              }
              .post-content h2 {
                font-size: 1.5rem !important;
                font-weight: 700 !important;
                margin-top: 2rem !important;
                margin-bottom: 0.75rem !important;
              }
              .post-content h3 {
                font-size: 1.25rem !important;
                font-weight: 600 !important;
                margin-top: 1.5rem !important;
                margin-bottom: 0.5rem !important;
              }
              .post-content table {
                width: 100% !important;
                border-collapse: collapse !important;
                margin: 1.5rem 0 !important;
                border: 2px solid #cbd5e1 !important;
                border-radius: 0.5rem !important;
                overflow: hidden !important;
              }
              .post-content th, .post-content td {
                border: 1px solid #cbd5e1 !important;
                padding: 0.6rem 1rem !important;
                text-align: left !important;
              }
              .dark .post-content table {
                border-color: #475569 !important;
              }
              .dark .post-content th, .dark .post-content td {
                border-color: #475569 !important;
              }
              .post-content th {
                background-color: #f1f5f9 !important;
                font-weight: 600 !important;
              }
              .dark .post-content th {
                background-color: #1e293b !important;
              }
            `}</style>
            <div
              className="post-content prose prose-sm sm:prose-base md:prose-lg dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 leading-relaxed"
              onClick={handleContentClick}
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          </div>
        </div>
      </motion.article>

      {/* 上一篇 / 下一篇 导航卡片 */}
      {(prevPost || nextPost) && (
        <nav
          aria-label="相邻文章导航"
          className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4"
        >
          {prevPost ? (
            <Link
              href={`/posts/${prevPost.slug}`}
              className="group flex flex-col justify-between rounded-2xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/40 dark:border-white/10 p-4 md:p-5 shadow-sm hover:shadow-lg hover:border-sky-400/50 dark:hover:border-sky-400/40 transition-all focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
                上一篇
              </span>
              <span className="text-sm md:text-base font-bold text-slate-800 dark:text-slate-100 line-clamp-2 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                {prevPost.title}
              </span>
            </Link>
          ) : (
            <div className="hidden sm:block" />
          )}

          {nextPost ? (
            <Link
              href={`/posts/${nextPost.slug}`}
              className="group flex flex-col justify-between sm:items-end sm:text-right rounded-2xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/40 dark:border-white/10 p-4 md:p-5 shadow-sm hover:shadow-lg hover:border-sky-400/50 dark:hover:border-sky-400/40 transition-all focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                下一篇
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
              <span className="text-sm md:text-base font-bold text-slate-800 dark:text-slate-100 line-clamp-2 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                {nextPost.title}
              </span>
            </Link>
          ) : (
            <div className="hidden sm:block" />
          )}
        </nav>
      )}

      {/* 评论区域 */}
      <PostComments postId={post.id} />

      {/* 图片灯箱（支持 Escape 关闭与图注显示） */}
      <div
        role="dialog"
        aria-modal={lightbox ? true : undefined}
        aria-label="图片放大预览"
        className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 transition-opacity duration-200 ${
          lightbox ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setLightbox(null)}
      >
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
        <button
          type="button"
          aria-label="关闭图片预览"
          onClick={() => setLightbox(null)}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors focus-visible:outline-2 focus-visible:outline-white"
        >
          <X className="w-6 h-6" />
        </button>
        {lightbox && (
          <div
            className="relative z-10 flex flex-col items-center max-w-[92vw] max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.src}
              alt={lightbox.caption}
              className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            {lightbox.caption && (
              <p className="mt-3 px-4 py-1.5 rounded-full bg-black/50 text-xs sm:text-sm text-white/85 text-center max-w-2xl">
                {lightbox.caption}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
