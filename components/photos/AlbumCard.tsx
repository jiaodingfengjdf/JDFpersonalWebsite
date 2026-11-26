"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Camera } from "lucide-react";
import PhotoCard from "./PhotoCard";
import type { Photo } from "@/types/photo";
import { bypassImageOptimization } from "@/lib/image";

export interface Album {
  id: number;
  title: string;
  description?: string;
  updatedAt: string;
  photoCount: number;
  photos: Photo[];
}

const STACK_ANGLES = [-4, 0, 3];
const FAN_ANGLES = [-12, 0, 12];
const FAN_Y = [-4, -10, -4];

interface AlbumCardProps {
  album: Album;
  isExpanded: boolean;
  onToggle: () => void;
  onPhotoClick: (photos: Photo[], index: number) => void;
}

export default function AlbumCard({
  album,
  isExpanded,
  onToggle,
  onPhotoClick,
}: AlbumCardProps) {
  const covers = album.photos.slice(0, 3).reverse();
  const isEmpty = album.photos.length === 0;

  return (
    <div
      className={`rounded-3xl overflow-hidden transition-colors ${
        isExpanded
          ? "bg-white/45 dark:bg-slate-800/50 backdrop-blur-md border border-white/50 dark:border-white/10 shadow-xl"
          : "bg-white/35 dark:bg-slate-800/40 hover:bg-white/50 dark:hover:bg-slate-800/60 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-lg"
      }`}
    >
      {/* 封面区域（未展开时点击展开；展开后可由顶部返回栏收起，也可点击封面收起） */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "收起" : "打开"}相册：${album.title}`}
        className="w-full text-left relative px-4 pt-5 pb-4 md:px-6 md:pt-6 md:pb-5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      >
        {/* 堆叠照片或空相册占位卡 */}
        <motion.div
          className="relative h-36 md:h-48 mx-auto max-w-[200px] md:max-w-[260px]"
          initial="rest"
          animate={isExpanded ? "hover" : "rest"}
          whileHover="hover"
        >
          {isEmpty ? (
            <div className="w-full h-full rounded-xl border-2 border-dashed border-slate-300/80 dark:border-slate-600/70 bg-slate-100/70 dark:bg-slate-800/70 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500 shadow-inner">
              <Camera className="w-8 h-8 md:w-10 md:h-10 opacity-60" />
              <span className="text-xs font-medium">暂无照片</span>
            </div>
          ) : (
            covers.map((photo, i) => (
              <motion.div
                key={photo.id}
                className="absolute inset-0"
                style={{ zIndex: i + 1 }}
                variants={{
                  rest: {
                    rotate: STACK_ANGLES[i] ?? 0,
                    y: i * 12,
                    scale: 1 - i * 0.04,
                    zIndex: i + 1,
                  },
                  hover: {
                    rotate: FAN_ANGLES[i] ?? 0,
                    y: FAN_Y[i] ?? 0,
                    scale: i === 1 ? 1 : 0.95,
                  },
                }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <div className="relative w-full h-full rounded-xl overflow-hidden shadow-lg ring-1 ring-black/5 dark:ring-white/10">
                  <Image
                    src={photo.url}
                    alt={photo.caption || album.title}
                    fill
                    unoptimized={bypassImageOptimization(photo.url)}
                    className="object-cover"
                    sizes="260px"
                  />
                </div>
              </motion.div>
            ))
          )}

          {/* 照片数量徽标 */}
          <div className="absolute -bottom-2 right-0 z-20 px-2.5 py-0.5 rounded-full bg-sky-600 text-white text-[10px] md:text-xs font-bold shadow-lg shadow-sky-500/30">
            {album.photos.length || album.photoCount} 张
          </div>
        </motion.div>

        {/* 相册信息 */}
        <div className="mt-5 md:mt-6 text-center">
          <h3 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100">
            {album.title}
          </h3>
          {album.description && !isExpanded && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-1 max-w-xs mx-auto">
              {album.description}
            </p>
          )}
          <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 mt-1">
            更新于 {album.updatedAt.replace("T", " ").slice(0, 16)}
          </p>
        </div>
      </button>

      {/* 展开的照片网格 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="overflow-hidden"
          >
            <div className="px-4 pb-6 md:px-6">
              {isEmpty ? (
                <div className="py-12 text-center rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-dashed border-slate-300/60 dark:border-white/10">
                  <Camera className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-60" />
                  <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
                    这个相册还没有上传照片
                  </p>
                </div>
              ) : (
                <div className="p-3 md:p-6 rounded-2xl bg-white/30 dark:bg-slate-900/30 border border-white/40 dark:border-white/5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
                    {album.photos.map((photo, photoIndex) => (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
                        index={photoIndex}
                        onClick={() => onPhotoClick(album.photos, photoIndex)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
