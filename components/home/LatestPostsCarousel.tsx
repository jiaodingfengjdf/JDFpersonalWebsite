"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Clock, Eye, Heart, RotateCcw } from "lucide-react";
import { getPosts, type PostItem } from "@/lib/api";
import { useSiteSettings } from "@/components/providers/SiteSettingsProvider";
import { bypassImageOptimization } from "@/lib/image";

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = new Date();
  const d = new Date(dateStr);
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "今天";
  if (days < 2) return "昨天";
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export default function LatestPostsCarousel() {
  const { appearance } = useSiteSettings();
  const defaultCover = appearance.defaultPostCover || "/images/default-cover.jpg";
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadSeed, setReloadSeed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPosts({ status: "published", page: 1, size: 4 })
      .then((data) => {
        if (cancelled) return;
        setPosts(data);
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadSeed]);

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label="加载最新文章中"
        className="flex flex-col gap-3 h-full animate-pulse"
      >
        <div className="relative flex-1 min-h-[160px] rounded-3xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl p-5 flex flex-col justify-end gap-2">
          <div className="h-5 w-2/3 rounded-lg bg-slate-300/70 dark:bg-slate-700/70" />
          <div className="h-3.5 w-1/2 rounded-lg bg-slate-200/80 dark:bg-slate-700/50" />
          <div className="h-3 w-36 rounded-lg bg-slate-200/70 dark:bg-slate-700/40" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, idx) => (
            <div
              key={idx}
              className="h-[80px] rounded-2xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 p-3 flex flex-col justify-end gap-1.5"
            >
              <div className="h-3 w-4/5 rounded bg-slate-300/60 dark:bg-slate-700/60" />
              <div className="h-2.5 w-1/3 rounded bg-slate-200/70 dark:bg-slate-700/40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl min-h-[220px] flex flex-col items-center justify-center gap-3 p-6 text-slate-500 dark:text-slate-400">
        <BookOpen className="w-10 h-10 opacity-45" />
        <span className="text-sm">最新文章加载失败</span>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError(false);
            setReloadSeed((s) => s + 1);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500/15 px-3.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-500/25 dark:text-sky-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          重试加载
        </button>
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className="rounded-3xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl min-h-[220px] flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
        <BookOpen className="w-10 h-10 opacity-40" />
        <span className="text-sm">暂无文章</span>
      </div>
    );
  }

  const hero = posts[0];
  const rest = posts.slice(1);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Hero 大图 */}
      <Link
        href={`/posts/${hero.slug}`}
        className="relative flex-1 min-h-[160px] md:min-h-[160px] rounded-3xl overflow-hidden group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        <Image
          src={hero.cover || defaultCover}
          alt={hero.title}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 66vw"
          priority
          unoptimized={bypassImageOptimization(hero.cover || defaultCover)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />

        {/* 底部信息 */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h3 className="text-xl md:text-2xl font-bold text-white mb-1.5 line-clamp-1">
            {hero.title}
          </h3>
          <p className="text-white/75 text-sm line-clamp-1 mb-2">
            {hero.description}
          </p>
          <div className="flex items-center gap-4 text-white/60 text-xs">
            <span>{relativeDate(hero.published_at)}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {hero.reading_time} 分钟
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" /> {hero.views}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3" /> {hero.likes}
            </span>
          </div>
        </div>
      </Link>

      {/* 小卡片行 */}
      {rest.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {rest.map((post) => (
            <Link
              key={post.id}
              href={`/posts/${post.slug}`}
              className="relative rounded-2xl overflow-hidden group cursor-pointer h-[80px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <Image
                src={post.cover || defaultCover}
                alt={post.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="200px"
                unoptimized={bypassImageOptimization(post.cover || defaultCover)}
              />
              <div className="absolute inset-0 bg-black/45 group-hover:bg-black/30 transition-colors duration-300" />
              <div className="absolute inset-0 p-3 flex flex-col justify-end">
                <h4 className="text-xs font-bold text-white line-clamp-1">
                  {post.title}
                </h4>
                <span className="text-[10px] text-white/65">
                  {relativeDate(post.published_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
