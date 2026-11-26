"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Camera, Play, Images } from "lucide-react";
import AlbumCard from "@/components/photos/AlbumCard";
import type { Album } from "@/components/photos/AlbumCard";
import Lightbox from "@/components/photos/Lightbox";
import type { Photo } from "@/types/photo";

export default function PhotoWallClient({ albums }: { albums: Album[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxAutoplay, setLightboxAutoplay] = useState(false);
  const [currentPhotos, setCurrentPhotos] = useState<Photo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const expandedRef = useRef<HTMLDivElement>(null);

  // 初始化读取 ?album=<id>，并监听浏览器返回/前进
  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("album");
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isInteger(parsed) && albums.some((a) => a.id === parsed)) {
        setExpandedId(parsed);
      } else {
        setExpandedId(null);
      }
      setUrlHydrated(true);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [albums]);

  // 将当前展开的相册 ID 同步至 URL
  useEffect(() => {
    if (!urlHydrated) return;
    const params = new URLSearchParams(window.location.search);
    if (expandedId !== null) {
      params.set("album", String(expandedId));
    } else {
      params.delete("album");
    }
    const qs = params.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [expandedId, urlHydrated]);

  // 当灯箱未打开且已展开某个相册时，按 Escape 返回全部相册；点击外部区域同样收起
  useEffect(() => {
    if (expandedId === null || lightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpandedId(null);
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (
        expandedRef.current &&
        !expandedRef.current.contains(e.target as Node)
      ) {
        setExpandedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [expandedId, lightboxOpen]);

  const openLightbox = useCallback(
    (photos: Photo[], index: number, autoplay = false) => {
      if (!photos.length) return;
      setCurrentPhotos(photos);
      setCurrentIndex(index);
      setLightboxAutoplay(autoplay);
      setLightboxOpen(true);
    },
    [],
  );

  const expandedAlbum = useMemo(
    () => albums.find((a) => a.id === expandedId) ?? null,
    [albums, expandedId],
  );

  const totalPhotosCount = useMemo(
    () => albums.reduce((sum, a) => sum + (a.photos.length || a.photoCount), 0),
    [albums],
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-12">
      {/* 页头 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-6 md:mb-10"
      >
        <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
          <Camera className="w-5 h-5 md:w-7 md:h-7 text-sky-600 dark:text-sky-400" />
          <h1 className="text-xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">
            照片墙
          </h1>
          {albums.length > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
              {albums.length} 本相册 · {totalPhotosCount} 张
            </span>
          )}
        </div>
        <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 ml-7 md:ml-10">
          用照片记录生活的每一个瞬间
        </p>
      </motion.div>

      {albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 md:py-32 text-slate-400">
          <Camera className="w-8 h-8 md:w-12 md:h-12 mb-3 md:mb-4 opacity-40" />
          <p className="text-sm md:text-base">暂无相册与照片</p>
        </div>
      ) : expandedAlbum ? (
        /* 单本相册展开视图（含吸顶返回与幻灯片浏览控制栏） */
        <div ref={expandedRef} className="space-y-4">
          <div className="sticky top-20 z-20 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-lg px-4 py-3 md:px-6 md:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setExpandedId(null)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-white text-xs md:text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>返回全部相册</span>
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm md:text-lg font-bold text-slate-900 dark:text-white truncate">
                    {expandedAlbum.title}
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
                    <Images className="w-3 h-3" />
                    {expandedAlbum.photos.length} 张照片
                  </span>
                </div>
                {expandedAlbum.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                    {expandedAlbum.description}
                  </p>
                )}
              </div>
            </div>

            {expandedAlbum.photos.length > 0 && (
              <button
                type="button"
                onClick={() => openLightbox(expandedAlbum.photos, 0, true)}
                className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs md:text-sm font-semibold shadow-md shadow-sky-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <Play className="w-4 h-4" />
                <span>幻灯片浏览</span>
              </button>
            )}
          </div>

          <AlbumCard
            album={expandedAlbum}
            isExpanded={true}
            onToggle={() => setExpandedId(null)}
            onPhotoClick={(photos, idx) => openLightbox(photos, idx, false)}
          />
        </div>
      ) : (
        /* 全部相册网格 */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 select-none">
          {albums.map((album, albumIndex) => (
            <motion.div
              key={album.id}
              layout
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: Math.min(albumIndex * 0.06, 0.36),
              }}
            >
              <AlbumCard
                album={album}
                isExpanded={false}
                onToggle={() => setExpandedId(album.id)}
                onPhotoClick={(photos, idx) => openLightbox(photos, idx, false)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* 灯箱 */}
      <Lightbox
        photos={currentPhotos}
        index={currentIndex}
        open={lightboxOpen}
        defaultAutoplay={lightboxAutoplay}
        onClose={() => {
          setLightboxOpen(false);
          setLightboxAutoplay(false);
        }}
        onPrev={() =>
          setCurrentIndex(
            (i) => (i - 1 + currentPhotos.length) % currentPhotos.length,
          )
        }
        onNext={() => setCurrentIndex((i) => (i + 1) % currentPhotos.length)}
      />
    </div>
  );
}
