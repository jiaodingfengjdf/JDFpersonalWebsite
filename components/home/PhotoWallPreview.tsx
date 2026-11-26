"use client";
/* eslint-disable @next/next/no-img-element -- 图片地址来自后台配置或第三方接口，域名不可预知，按 lib/image.ts 的约定绕过 next/image 优化器 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, RotateCcw } from "lucide-react";
import { getAlbums, getAlbumPhotos, type AlbumItem } from "@/lib/api";

interface Photo {
  id: number;
  url: string;
  caption: string;
}

function pickOrderedCandidates(albums: AlbumItem[], isMobile: boolean): AlbumItem[] {
  const preferredTitle = isMobile ? "2" : "1";
  const secondaryTitle = isMobile ? "1" : "2";
  const seen = new Set<number>();
  const result: AlbumItem[] = [];

  const pushIfNew = (album: AlbumItem | undefined) => {
    if (album && !seen.has(album.id)) {
      seen.add(album.id);
      result.push(album);
    }
  };

  pushIfNew(albums.find((a) => a.title === preferredTitle && a.photo_count > 0));
  pushIfNew(albums.find((a) => a.title === secondaryTitle && a.photo_count > 0));
  pushIfNew(albums.find((a) => a.photo_count > 0));
  pushIfNew(albums.find((a) => a.title === preferredTitle));
  pushIfNew(albums.find((a) => a.title === secondaryTitle));
  for (const album of albums) {
    pushIfNew(album);
  }
  return result;
}

export default function PhotoWallPreview() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [albumTitle, setAlbumTitle] = useState<string>("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadSeed, setReloadSeed] = useState(0);

  const startX = useRef(0);
  const endX = useRef(0);
  const didSwipe = useRef(false);
  const isDragging = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const isMobile = window.innerWidth < 768;
        const albums = await getAlbums();
        if (cancelled) return;

        if (!albums.length) {
          setPhotos([]);
          setAlbumTitle("");
          setError(false);
          return;
        }

        const candidates = pickOrderedCandidates(albums, isMobile);
        let chosenTitle = candidates[0].title;
        let loadedPhotos: Photo[] = [];

        for (const candidate of candidates.slice(0, 4)) {
          const list = await getAlbumPhotos(candidate.id);
          if (cancelled) return;
          if (list && list.length > 0) {
            chosenTitle = candidate.title;
            loadedPhotos = [...list].reverse();
            break;
          }
        }

        setAlbumTitle(chosenTitle);
        setPhotos(loadedPhotos);
        setCurrentIndex(0);
        setError(false);
      } catch {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadSeed]);

  useEffect(() => {
    if (photos.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [photos.length]);

  // 预加载下一张，避免切图时闪烁
  useEffect(() => {
    if (photos.length < 2) return;
    const next = (currentIndex + 1) % photos.length;
    const img = new Image();
    img.src = photos[next].url;
  }, [currentIndex, photos]);

  const goNext = useCallback(() => {
    if (photos.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % photos.length);
  }, [photos.length]);

  const goPrev = useCallback(() => {
    if (photos.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
  }, [photos.length]);

  function handlePointerDown(clientX: number) {
    startX.current = clientX;
    endX.current = clientX;
    didSwipe.current = false;
    isDragging.current = true;
  }

  function handlePointerMove(clientX: number) {
    if (!isDragging.current) return;
    endX.current = clientX;
  }

  function handlePointerUp() {
    if (!isDragging.current) return;
    isDragging.current = false;
    const diff = startX.current - endX.current;
    if (Math.abs(diff) > 40) {
      didSwipe.current = true;
      if (diff > 0) goNext();
      else goPrev();
    }
  }

  function handleClick() {
    if (didSwipe.current) {
      didSwipe.current = false;
      return;
    }
    router.push("/photowall");
  }

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label="加载照片墙预览中"
        className="rounded-3xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden min-h-[240px] md:min-h-[420px] h-full flex flex-col justify-between p-5 animate-pulse"
      >
        <div className="h-6 w-24 rounded-full bg-slate-300/60 dark:bg-slate-700/70" />
        <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
          <Camera className="w-10 h-10 opacity-40" />
          <div className="h-3 w-20 rounded bg-slate-300/60 dark:bg-slate-700/70" />
        </div>
        <div className="flex justify-end gap-1.5">
          <div className="h-1.5 w-6 rounded-full bg-slate-300/60 dark:bg-slate-700/70" />
          <div className="h-1.5 w-2 rounded-full bg-slate-300/60 dark:bg-slate-700/70" />
          <div className="h-1.5 w-2 rounded-full bg-slate-300/60 dark:bg-slate-700/70" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden min-h-[240px] md:min-h-[420px] h-full flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-500 dark:text-slate-400">
        <Camera className="w-10 h-10 opacity-45" />
        <span className="text-sm">相册预览加载失败</span>
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

  if (!photos.length) {
    return (
      <div
        onClick={handleClick}
        className="rounded-3xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden min-h-[240px] md:min-h-[420px] h-full flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500 cursor-pointer"
      >
        <Camera className="w-12 h-12 opacity-40" />
        <span className="text-sm">暂无照片</span>
      </div>
    );
  }

  const safeIndex = currentIndex % photos.length;
  const activePhoto = photos[safeIndex];
  const displayAlbumLabel =
    albumTitle && albumTitle !== "1" && albumTitle !== "2"
      ? albumTitle
      : "照片墙精选";

  return (
    <div
      onClick={handleClick}
      className="rounded-3xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden relative group min-h-[240px] md:min-h-[420px] h-full flex flex-col select-none cursor-pointer touch-none"
      onTouchStart={(e) => handlePointerDown(e.touches[0].clientX)}
      onTouchMove={(e) => handlePointerMove(e.touches[0].clientX)}
      onTouchEnd={handlePointerUp}
      onMouseDown={(e) => {
        e.preventDefault();
        handlePointerDown(e.clientX);
      }}
      onMouseMove={(e) => handlePointerMove(e.clientX)}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
    >
      {/* 相册标题胶囊 */}
      <div className="absolute top-4 left-4 z-30 inline-flex max-w-[75%] items-center gap-1.5 rounded-full border border-white/30 bg-slate-900/45 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
        <Camera className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />
        <span className="truncate">{displayAlbumLabel}</span>
      </div>

      {/* 当前照片交叉渐隐 */}
      <AnimatePresence>
        <motion.div
          key={activePhoto.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.0 }}
          className="absolute inset-0"
        >
          <img
            src={activePhoto.url}
            draggable={false}
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 pointer-events-none"
            alt={activePhoto.caption || displayAlbumLabel}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {activePhoto.caption && (
        <div className="pointer-events-none absolute bottom-4 left-4 right-28 z-20 truncate text-xs font-medium text-white/90">
          {activePhoto.caption}
        </div>
      )}

      {/* 可点击圆点指示器 */}
      {photos.length > 1 && (
        <div className="absolute bottom-4 right-5 z-30 flex items-center gap-1.5">
          {photos.slice(0, 8).map((photo, i) => (
            <button
              type="button"
              key={photo.id}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(i);
              }}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                i === safeIndex
                  ? "w-6 bg-sky-400 shadow-xs"
                  : "w-2 bg-white/50 hover:bg-white/90"
              }`}
              aria-label={`切换到第 ${i + 1} 张照片`}
              aria-current={i === safeIndex ? "true" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
