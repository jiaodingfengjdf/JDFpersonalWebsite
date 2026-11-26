"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Eye, Heart, Clock, Pin, FolderOpen } from "lucide-react";
import { useSiteSettings } from "@/components/providers/SiteSettingsProvider";
import { bypassImageOptimization } from "@/lib/image";

export type PostViewMode = "grid" | "list";

export interface PostOut {
  id: number;
  title: string;
  slug: string;
  description: string;
  summary?: string;
  cover: string;
  category: string;
  tags: string[];
  status: string;
  is_pinned: boolean;
  views: number;
  likes: number;
  word_count: number;
  reading_time: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PostCardProps {
  post: PostOut;
  index: number;
  viewMode?: PostViewMode;
}

export default function PostCard({
  post,
  index,
  viewMode = "grid",
}: PostCardProps) {
  const { appearance } = useSiteSettings();
  const defaultCover = appearance.defaultPostCover || "/images/default-cover.jpg";
  const coverSrc = post.cover || defaultCover;
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode !== "grid" || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -5;
    const rotateY = ((x - centerX) / centerX) * 5;
    setTilt({ rotateX, rotateY });
    setGlare({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.14,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0 });
    setGlare({ x: 50, y: 50, opacity: 0 });
  };

  const rawDate = post.published_at || post.created_at;
  const dateStr = rawDate
    ? new Date(rawDate).toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : "";

  const summaryText = post.summary ?? post.description;
  const estimatedReadingMinutes =
    post.reading_time > 0
      ? post.reading_time
      : post.word_count > 0
        ? Math.max(1, Math.ceil(post.word_count / 300))
        : Math.max(1, Math.ceil((summaryText?.length || 200) / 120));

  const visibleTags = post.tags.slice(0, 3);
  const extraTagCount = Math.max(0, post.tags.length - 3);

  if (viewMode === "list") {
    return (
      <motion.div
        initial={index < 4 ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: Math.min(index, 6) * 0.04, ease: "easeOut" }}
      >
        <Link
          href={`/posts/${post.slug}`}
          className="group flex items-center gap-3.5 sm:gap-5 rounded-2xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/40 dark:border-white/10 p-3.5 sm:p-4 md:p-5 shadow-sm hover:shadow-lg hover:border-sky-400/50 dark:hover:border-sky-400/40 transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
        >
          {/* 紧凑缩略图 */}
          <div className="hidden sm:block relative w-28 md:w-36 aspect-[16/10] rounded-xl overflow-hidden shrink-0">
            <Image
              src={coverSrc}
              alt={post.title}
              fill
              priority={index < 3}
              unoptimized={bypassImageOptimization(coverSrc)}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="160px"
            />
            {post.is_pinned && (
              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/90 text-white text-[10px] font-medium">
                <Pin className="w-2.5 h-2.5" />
                置顶
              </span>
            )}
          </div>

          {/* 文本与元信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mb-1">
              {post.is_pinned && (
                <span className="sm:hidden inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/90 text-white text-[10px] font-medium">
                  <Pin className="w-2.5 h-2.5" />
                  置顶
                </span>
              )}
              {post.category && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 font-medium">
                  <FolderOpen className="w-3 h-3" />
                  {post.category}
                </span>
              )}
              {dateStr && <span suppressHydrationWarning>{dateStr}</span>}
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                约 {estimatedReadingMinutes} 分钟
              </span>
            </div>

            <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-800 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors line-clamp-1 mb-1">
              {post.title}
            </h3>

            {summaryText && (
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 line-clamp-1 mb-2.5">
                {summaryText}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {visibleTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full text-[11px] bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20"
                  >
                    #{tag}
                  </span>
                ))}
                {extraTagCount > 0 && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    +{extraTagCount}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 ml-auto">
                <span className="inline-flex items-center gap-1" title="阅读量">
                  <Eye className="w-3.5 h-3.5" />
                  {post.views}
                </span>
                <span className="inline-flex items-center gap-1" title="点赞数">
                  <Heart className="w-3.5 h-3.5" />
                  {post.likes}
                </span>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={index < 3 ? false : { opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index, 6) * 0.06, ease: "easeOut" }}
      className="h-full"
    >
      <Link
        href={`/posts/${post.slug}`}
        className="block h-full rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
      >
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="group relative h-full rounded-3xl overflow-hidden cursor-pointer"
          style={{
            perspective: "1000px",
            transformStyle: "preserve-3d",
          }}
        >
          <div
            className="relative h-full flex flex-col rounded-3xl overflow-hidden bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-lg hover:shadow-xl transition-all duration-200 ease-out"
            style={{
              transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
              transformStyle: "preserve-3d",
            }}
          >
            {/* 封面图 */}
            <div className="relative aspect-[16/10] w-full overflow-hidden shrink-0">
              <Image
                src={coverSrc}
                alt={post.title}
                fill
                priority={index < 3}
                unoptimized={bypassImageOptimization(coverSrc)}
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

              {/* 置顶标记 */}
              {post.is_pinned && (
                <div className="absolute top-2.5 left-2.5 md:top-3.5 md:left-3.5 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/90 backdrop-blur-sm text-white text-[11px] font-medium shadow-sm">
                  <Pin className="w-3 h-3" />
                  置顶
                </div>
              )}

              {/* 分类标记 */}
              {post.category && (
                <div className="absolute top-2.5 right-2.5 md:top-3.5 md:right-3.5 px-2.5 py-0.5 rounded-full bg-slate-900/65 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium">
                  {post.category}
                </div>
              )}
            </div>

            {/* 卡片主体信息 */}
            <div className="p-4 md:p-5 flex flex-col flex-1">
              <h3 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors mb-1.5 line-clamp-2 leading-snug">
                {post.title}
              </h3>

              {summaryText && (
                <p className="text-slate-600 dark:text-slate-300 text-xs md:text-sm line-clamp-2 leading-relaxed mb-3">
                  {summaryText}
                </p>
              )}

              {/* 标签药丸（最多展示 3 个） */}
              {visibleTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  {visibleTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20"
                    >
                      #{tag}
                    </span>
                  ))}
                  {extraTagCount > 0 && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      +{extraTagCount}
                    </span>
                  )}
                </div>
              )}

              {/* 底部统计与阅读时长 */}
              <div className="mt-auto pt-3 border-t border-slate-200/60 dark:border-white/10 flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  {dateStr && (
                    <span className="truncate" suppressHydrationWarning>
                      {dateStr}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-sky-500/80" />
                    {estimatedReadingMinutes} 分钟
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="inline-flex items-center gap-1" title="阅读量">
                    <Eye className="w-3.5 h-3.5" />
                    {post.views}
                  </span>
                  <span className="inline-flex items-center gap-1" title="点赞数">
                    <Heart className="w-3.5 h-3.5" />
                    {post.likes}
                  </span>
                </div>
              </div>
            </div>

            {/* 3D 光泽效果 */}
            <div
              className="absolute inset-0 pointer-events-none rounded-3xl transition-opacity duration-200"
              style={{
                background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,${glare.opacity}), transparent 60%)`,
              }}
            />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
