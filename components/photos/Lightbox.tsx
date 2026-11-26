"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
} from "lucide-react";
import type { Photo } from "@/types/photo";
import { bypassImageOptimization } from "@/lib/image";

interface LightboxProps {
  photos: Photo[];
  index: number;
  open: boolean;
  defaultAutoplay?: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

function LightboxStage({
  photos,
  index,
  defaultAutoplay,
  onClose,
  onPrev,
  onNext,
}: Omit<LightboxProps, "open">) {
  const photo = photos[index];
  const [zoomed, setZoomed] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(
    Boolean(defaultAutoplay && photos.length > 1),
  );
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const stepPrev = useCallback(() => {
    setZoomed(false);
    onPrev();
  }, [onPrev]);

  const stepNext = useCallback(() => {
    setZoomed(false);
    onNext();
  }, [onNext]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft" && photos.length > 1) {
        stepPrev();
      } else if (e.key === "ArrowRight" && photos.length > 1) {
        stepNext();
      } else if (e.key === " ") {
        if (photos.length > 1) {
          e.preventDefault();
          setIsAutoPlaying((p) => !p);
        }
      }
    },
    [onClose, stepPrev, stepNext, photos.length],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // 自动播放幻灯片 (3.5s)
  useEffect(() => {
    if (!isAutoPlaying || photos.length <= 1) return;
    const timer = window.setInterval(() => {
      setZoomed(false);
      onNext();
    }, 3500);
    return () => window.clearInterval(timer);
  }, [isAutoPlaying, photos.length, onNext]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || zoomed || photos.length <= 1) {
        touchStartRef.current = null;
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (dx < 0) {
          stepNext();
        } else {
          stepPrev();
        }
      }
    },
    [zoomed, photos.length, stepNext, stepPrev],
  );

  if (!photo) return null;

  const metaParts = [
    photo.caption,
    photo.width && photo.height ? `${photo.width} × ${photo.height}` : "",
    photo.format?.toUpperCase(),
  ].filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label="照片灯箱预览"
      className="fixed inset-0 z-[9999] flex items-center justify-center select-none"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/88 backdrop-blur-md" />

      {/* 顶部控制栏：计数器 + 缩放 + 幻灯片 + 关闭 */}
      <div
        className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between gap-2 pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-auto px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-white text-xs md:text-sm font-semibold tabular-nums border border-white/15">
          {index + 1} / {photos.length}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {photos.length > 1 && (
            <button
              type="button"
              onClick={() => setIsAutoPlaying((p) => !p)}
              aria-label={isAutoPlaying ? "暂停幻灯片" : "播放幻灯片 3.5 秒"}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs md:text-sm font-semibold backdrop-blur-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                isAutoPlaying
                  ? "bg-sky-500 text-white border-sky-400"
                  : "bg-white/15 hover:bg-white/25 text-white border-white/15"
              }`}
            >
              {isAutoPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">暂停幻灯片</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">播放幻灯片 3.5s</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            aria-label={zoomed ? "缩小至 1x" : "放大至 2x"}
            title={zoomed ? "1x 原始视图" : "2x 放大视图"}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs md:text-sm font-semibold backdrop-blur-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              zoomed
                ? "bg-sky-500 text-white border-sky-400"
                : "bg-white/15 hover:bg-white/25 text-white border-white/15"
            }`}
          >
            {zoomed ? (
              <ZoomOut className="w-4 h-4" />
            ) : (
              <ZoomIn className="w-4 h-4" />
            )}
            <span>{zoomed ? "2x" : "1x"}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭灯箱"
            className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 左箭头 */}
      {photos.length > 1 && (
        <button
          type="button"
          aria-label="上一张照片"
          onClick={(e) => {
            e.stopPropagation();
            stepPrev();
          }}
          className="absolute left-3 md:left-5 z-20 p-2.5 md:p-3 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* 右箭头 */}
      {photos.length > 1 && (
        <button
          type="button"
          aria-label="下一张照片"
          onClick={(e) => {
            e.stopPropagation();
            stepNext();
          }}
          className="absolute right-3 md:right-5 z-20 p-2.5 md:p-3 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* 图片展示区 */}
      <motion.div
        key={photo.id}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className={`relative z-10 flex items-center justify-center ${
          zoomed
            ? "max-w-[95vw] max-h-[85vh] overflow-auto cursor-zoom-out"
            : "max-w-[90vw] max-h-[80vh] cursor-zoom-in"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          setZoomed((z) => !z);
        }}
      >
        <div
          className="transition-transform duration-300 ease-out"
          style={{
            transform: zoomed ? "scale(2)" : "scale(1)",
            transformOrigin: "center center",
          }}
        >
          <Image
            src={photo.url}
            alt={photo.caption || "照片"}
            width={1600}
            height={1200}
            unoptimized={bypassImageOptimization(photo.url)}
            className="max-h-[78vh] w-auto object-contain rounded-lg shadow-2xl"
            priority
          />
        </div>
      </motion.div>

      {/* 底部图片说明 */}
      {metaParts.length > 0 && (
        <div
          className="absolute bottom-5 left-4 right-4 text-center z-20 pointer-events-none"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-black/50 backdrop-blur-md text-xs md:text-sm text-white/85 font-serif italic border border-white/10">
            {metaParts.join(" · ")}
          </span>
        </div>
      )}
    </motion.div>
  );
}

export default function Lightbox({
  photos,
  index,
  open,
  defaultAutoplay = false,
  onClose,
  onPrev,
  onNext,
}: LightboxProps) {
  // 打开时禁止背景滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && photos[index] && (
        <LightboxStage
          photos={photos}
          index={index}
          defaultAutoplay={defaultAutoplay}
          onClose={onClose}
          onPrev={onPrev}
          onNext={onNext}
        />
      )}
    </AnimatePresence>
  );
}
