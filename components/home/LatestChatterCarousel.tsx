"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { MessageSquare, Heart, RotateCcw } from "lucide-react";
import { getChatters } from "@/lib/api";
import type { ChatterItem } from "@/lib/api";
import { bypassImageOptimization } from "@/lib/image";
import { formatRelativeTime } from "@/lib/format";

function ChatterImage({ src }: { src: string }) {
  const [isLandscape, setIsLandscape] = useState(true);
  return (
    <div
      className={`rounded-lg overflow-hidden relative shrink-0 ${
        isLandscape ? "w-[100px] h-[56px]" : "w-[56px] h-[72px]"
      }`}
    >
      <Image
        src={src}
        fill
        unoptimized={bypassImageOptimization(src)}
        sizes={isLandscape ? "100px" : "56px"}
        draggable={false}
        className="object-cover"
        alt=""
        onLoad={(e) => {
          const img = e.currentTarget;
          setIsLandscape(img.naturalWidth >= img.naturalHeight);
        }}
      />
    </div>
  );
}

const SWIPE_THRESHOLD = 80;

export default function LatestChatterCarousel() {
  const router = useRouter();
  const [items, setItems] = useState<ChatterItem[]>([]);
  const [topIndex, setTopIndex] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadSeed, setReloadSeed] = useState(0);

  const startX = useRef(0);
  const startY = useRef(0);
  const didDrag = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getChatters({ status: "published", page: 1, size: 50 })
      .then((data) => {
        if (cancelled) return;
        if (!data.length) {
          setItems([]);
          setError(false);
          return;
        }
        const latestDate = data[0].created_at.slice(0, 10);
        const latestDay = data.filter(
          (c) => c.created_at.slice(0, 10) === latestDate,
        );
        setItems(latestDay.length > 0 ? latestDay : data.slice(0, 5));
        setTopIndex(0);
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

  const goNext = useCallback(() => {
    if (items.length <= 1) return;
    setTopIndex((prev) => (prev + 1) % items.length);
    setOffset({ x: 0, y: 0 });
  }, [items.length]);

  function handlePointerDown(clientX: number, clientY: number) {
    startX.current = clientX;
    startY.current = clientY;
    didDrag.current = false;
    setIsDragging(true);
  }

  function handlePointerMove(clientX: number, clientY: number) {
    if (!isDragging) return;
    const dx = clientX - startX.current;
    const dy = clientY - startY.current;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      didDrag.current = true;
    }
    setOffset({ x: dx, y: dy });
  }

  function handlePointerUp() {
    if (!isDragging) return;
    setIsDragging(false);
    const dist = Math.sqrt(offset.x ** 2 + offset.y ** 2);
    if (dist > SWIPE_THRESHOLD) {
      goNext();
    } else {
      setOffset({ x: 0, y: 0 });
    }
  }

  function handleClick() {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    const current = items[topIndex];
    if (current) {
      router.push(`/moments?onlyView=${current.id}`);
    } else {
      router.push("/moments");
    }
  }

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label="加载最新说说中"
        className="w-full h-full rounded-3xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl min-h-[160px] md:min-h-[220px] p-5 flex flex-col justify-between animate-pulse"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-14 rounded-full bg-slate-300/60 dark:bg-slate-700/70" />
            <div className="h-3.5 w-20 rounded bg-slate-200/80 dark:bg-slate-700/50" />
          </div>
          <div className="h-3.5 w-full rounded bg-slate-300/60 dark:bg-slate-700/60" />
          <div className="h-3.5 w-4/5 rounded bg-slate-200/80 dark:bg-slate-700/50" />
        </div>
        <div className="h-3.5 w-12 rounded bg-slate-200/70 dark:bg-slate-700/40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full rounded-3xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl min-h-[160px] md:min-h-[220px] flex flex-col items-center justify-center gap-3 p-6 text-slate-500 dark:text-slate-400">
        <MessageSquare className="w-10 h-10 opacity-45" />
        <span className="text-sm">最新说说加载失败</span>
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

  if (!items.length) {
    return (
      <div className="w-full h-full rounded-3xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl min-h-[160px] md:min-h-[220px] flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
        <MessageSquare className="w-10 h-10 opacity-40" />
        <span className="text-sm">暂无说说</span>
      </div>
    );
  }

  const rotation = offset.x * 0.06;
  const dist = Math.sqrt(offset.x ** 2 + offset.y ** 2);
  const opacity = Math.max(0, 1 - dist / 300);

  return (
    <div
      className="w-full h-full rounded-3xl overflow-hidden relative min-h-[160px] md:min-h-[220px] select-none cursor-grab active:cursor-grabbing touch-none"
      onMouseDown={(e) => {
        e.preventDefault();
        handlePointerDown(e.clientX, e.clientY);
      }}
      onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={(e) =>
        handlePointerDown(e.touches[0].clientX, e.touches[0].clientY)
      }
      onTouchMove={(e) =>
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)
      }
      onTouchEnd={handlePointerUp}
      onClick={handleClick}
    >
      {[...items].reverse().map((item, reverseIdx) => {
        const idx = items.length - 1 - reverseIdx;
        const stackPos =
          (idx - topIndex + items.length) % items.length;
        if (stackPos > 2) return null;

        const isTop = stackPos === 0;
        const scale = 1 - stackPos * 0.04;
        const translateY = stackPos * 8;

        return (
          <motion.div
            key={item.id}
            animate={{
              scale: isTop && isDragging ? 1 : scale,
              y: isTop && isDragging ? offset.y : translateY,
              x: isTop ? offset.x : 0,
              rotate: isTop ? rotation : 0,
              opacity: isTop ? opacity : 0.6 - stackPos * 0.2,
              zIndex: items.length - stackPos,
            }}
            transition={
              isTop && isDragging
                ? { duration: 0 }
                : { type: "spring", stiffness: 400, damping: 30 }
            }
            className={`absolute inset-0 rounded-3xl border shadow-lg p-3 md:p-5 flex flex-col justify-between pointer-events-none overflow-hidden ${
              isTop
                ? "bg-white/85 dark:bg-slate-800/85 backdrop-blur-md border-white/50 dark:border-white/10"
                : "bg-slate-200/80 dark:bg-slate-700/80 border-slate-200 dark:border-slate-700"
            }`}
          >
            {isTop ? (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    {item.mood && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium">
                        {item.mood}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-3">
                    {item.content}
                  </p>
                  {item.images.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {item.images.slice(0, 3).map((img, i) => (
                        <ChatterImage key={i} src={img} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-3">
                  <Heart className="w-3.5 h-3.5" />
                  <span>{item.likes}</span>
                </div>
              </>
            ) : null}
          </motion.div>
        );
      })}

      {items.length > 1 && (
        <div className="absolute bottom-4 right-5 z-30 flex gap-1.5">
          {items.map((item, i) => (
            <button
              type="button"
              key={item.id}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setTopIndex(i);
                setOffset({ x: 0, y: 0 });
              }}
              aria-label={`查看第 ${i + 1} 条说说`}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                i === topIndex ? "w-4 bg-sky-500" : "w-1.5 bg-slate-400/50 dark:bg-white/30 hover:bg-sky-400/70"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
