"use client";
/* eslint-disable @next/next/no-img-element -- 图片地址来自后台配置或第三方接口，域名不可预知，按 lib/image.ts 的约定绕过 next/image 优化器 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  animate,
} from "framer-motion";
import {
  Clock,
  BookOpen,
  Eye,
  Heart,
  Calendar,
  Search,
  X,
  Waves,
  ListOrdered,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { PostItem } from "@/server/modules/posts/contracts";
import { formatDate } from "@/lib/format";
import { useTheme } from "@/components/providers/ThemeProvider";

// ── 分类样式 ──────────────────────────────────────────

function getCatTextColor(cat: string): string {
  const map: Record<string, string> = {
    技术: "text-cyan-700 dark:text-cyan-300",
    生活: "text-violet-700 dark:text-violet-300",
    学术: "text-amber-700 dark:text-amber-300",
    随笔: "text-pink-700 dark:text-pink-300",
    项目: "text-emerald-700 dark:text-emerald-300",
    教程: "text-blue-700 dark:text-blue-300",
  };
  return map[cat] || "text-slate-600 dark:text-slate-300";
}

function getCatBgColor(cat: string): string {
  const map: Record<string, string> = {
    技术: "bg-cyan-500/15",
    生活: "bg-violet-500/15",
    学术: "bg-amber-500/15",
    随笔: "bg-pink-500/15",
    项目: "bg-emerald-500/15",
    教程: "bg-blue-500/15",
  };
  return map[cat] || "bg-slate-500/15";
}

function getCatColor(cat: string, isDark: boolean): string {
  const darkMap: Record<string, string> = {
    技术: "#22d3ee",
    生活: "#a78bfa",
    学术: "#fbbf24",
    随笔: "#f472b6",
    项目: "#34d399",
    教程: "#60a5fa",
  };
  const lightMap: Record<string, string> = {
    技术: "#0891b2",
    生活: "#7c3aed",
    学术: "#d97706",
    随笔: "#db2777",
    项目: "#059669",
    教程: "#2563eb",
  };
  const map = isDark ? darkMap : lightMap;
  return map[cat] || (isDark ? "#94a3b8" : "#475569");
}

// ── 河流路径生成（带步长控制）──────────────────────────

function buildRiverPath(
  totalWidth: number,
  riverY: number,
  amplitude: number,
  wavelength: number,
  offsetY = 0,
  stepSize: number,
): string {
  const parts: string[] = [];
  const steps = Math.max(1, Math.ceil(totalWidth / stepSize));
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * totalWidth;
    const y =
      riverY +
      amplitude * 0.5 * Math.sin((x / wavelength) * Math.PI * 2) +
      amplitude * 0.3 * Math.sin((x / (wavelength * 0.6)) * Math.PI * 2 + 1) +
      amplitude * 0.2 * Math.sin((x / (wavelength * 1.5)) * Math.PI * 2 + 2.5);
    parts.push(
      `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${(y + offsetY).toFixed(1)}`,
    );
  }
  return parts.join(" ");
}

type TimelineViewMode = "river" | "classic";

export default function TimelineClient({ posts }: { posts: PostItem[] }) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [viewMode, setViewMode] = useState<TimelineViewMode>("river");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeYear, setActiveYear] = useState<string>("");

  const [isMobile, setIsMobile] = useState(false);
  const [viewWidth, setViewWidth] = useState(1200);
  const [dragX, setDragX] = useState(0);
  const didDrag = useRef(false);
  const rafRef = useRef<number>(0);
  const latestXRef = useRef(0);
  const riverViewportRef = useRef<HTMLDivElement>(null);

  const xMotion = useMotionValue(0);

  useEffect(() => {
    const check = () => {
      const vw = window.innerWidth;
      setIsMobile(vw < 768);
      setViewWidth(vw);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 提取全部分类与计数
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) {
      const cat = p.category?.trim();
      if (!cat) continue;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  }, [posts]);

  // 排序并过滤文章
  const sorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...posts]
      .filter((post) => {
        if (selectedCategory && post.category !== selectedCategory) {
          return false;
        }
        if (!q) return true;
        return (
          post.title.toLowerCase().includes(q) ||
          (post.description ?? "").toLowerCase().includes(q) ||
          (post.category ?? "").toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.published_at || b.created_at).getTime() -
          new Date(a.published_at || a.created_at).getTime(),
      );
  }, [posts, selectedCategory, searchQuery]);

  // 按年份统计与分组（供年份胶囊与经典年表共用）
  const yearGroups = useMemo(() => {
    const map = new Map<string, { year: string; posts: PostItem[]; firstIndex: number }>();
    sorted.forEach((post, idx) => {
      const rawDate = post.published_at || post.created_at;
      const year = String(new Date(rawDate).getFullYear());
      const existing = map.get(year);
      if (existing) {
        existing.posts.push(post);
      } else {
        map.set(year, { year, posts: [post], firstIndex: idx });
      }
    });
    return Array.from(map.values());
  }, [sorted]);

  // 响应式常量
  const CARD_W = isMobile ? 175 : 240;
  const CARD_H = isMobile ? 185 : 230;
  const CARD_GAP = isMobile ? 40 : 60;
  const RIVER_Y = isMobile ? 185 : 240;
  const SVG_TOP = -100;
  const AMPLITUDE = isMobile ? 50 : 80;
  const WAVELENGTH = isMobile ? 400 : 600;
  const PADDING = isMobile ? 180 : 420;

  const totalWidth = useMemo(
    () =>
      Math.max(
        viewWidth,
        PADDING * 2 + Math.max(1, sorted.length) * (CARD_W + CARD_GAP) - CARD_GAP,
      ),
    [viewWidth, PADDING, sorted.length, CARD_W, CARD_GAP],
  );

  const minX = Math.min(0, -(totalWidth - viewWidth));
  const svgHeight = RIVER_Y + AMPLITUDE + CARD_H + 120 - SVG_TOP;

  const clampX = useCallback(
    (val: number) => Math.max(minX, Math.min(0, val)),
    [minX],
  );

  // 同步 MotionValue 变化到渲染裁剪状态（rAF 合并）
  useMotionValueEvent(xMotion, "change", (latest) => {
    latestXRef.current = latest;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      setDragX(latestXRef.current);
      rafRef.current = 0;
    });
  });

  // 初始定位与筛选列表变化时定位到第一篇卡片居中偏左
  useEffect(() => {
    if (sorted.length === 0) return;
    const initialTarget = clampX(-(PADDING - Math.max(24, (viewWidth - CARD_W) / 4)));
    xMotion.set(initialTarget);
    latestXRef.current = initialTarget;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步初始河流裁剪窗口偏移量
    setDragX(initialTarget);
  }, [sorted.length, PADDING, viewWidth, CARD_W, clampX, xMotion]);

  const panToX = useCallback(
    (target: number) => {
      const clamped = clampX(target);
      animate(xMotion, clamped, {
        type: "spring",
        stiffness: 260,
        damping: 32,
      });
    },
    [clampX, xMotion],
  );

  const panByStep = useCallback(
    (direction: "left" | "right") => {
      const delta = (CARD_W + CARD_GAP) * 2;
      const next =
        direction === "left"
          ? latestXRef.current + delta
          : latestXRef.current - delta;
      panToX(next);
    },
    [CARD_W, CARD_GAP, panToX],
  );

  // 鼠标滚轮水平平移时光长河
  useEffect(() => {
    const el = riverViewportRef.current;
    if (!el || viewMode !== "river" || sorted.length === 0) return;

    const onWheel = (e: WheelEvent) => {
      const dominantDelta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (dominantDelta === 0) return;
      const current = latestXRef.current;
      const next = clampX(current - dominantDelta * 1.15);
      if (next !== current) {
        e.preventDefault();
        xMotion.set(next);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [viewMode, sorted.length, clampX, xMotion]);

  // 键盘左右方向键平移时光长河
  useEffect(() => {
    if (viewMode !== "river" || sorted.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        panByStep("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        panByStep("right");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewMode, sorted.length, panByStep]);

  // 点击年份胶囊快速跳转
  const handleJumpToYear = useCallback(
    (year: string, firstIndex: number) => {
      setActiveYear(year);
      if (viewMode === "river") {
        const cardX = PADDING + firstIndex * (CARD_W + CARD_GAP);
        const centeredTarget = -(cardX - (viewWidth - CARD_W) / 2);
        panToX(centeredTarget);
      } else {
        const section = document.getElementById(`timeline-year-${year}`);
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [viewMode, PADDING, CARD_W, CARD_GAP, viewWidth, panToX],
  );

  // 河流路径
  const riverStepSize = isMobile ? 20 : 6;
  const riverPath = useMemo(
    () =>
      buildRiverPath(
        totalWidth,
        RIVER_Y,
        AMPLITUDE,
        WAVELENGTH,
        0,
        riverStepSize,
      ),
    [totalWidth, RIVER_Y, AMPLITUDE, WAVELENGTH, riverStepSize],
  );

  const riverPathBottom = useMemo(
    () =>
      buildRiverPath(
        totalWidth,
        RIVER_Y,
        AMPLITUDE,
        WAVELENGTH,
        12,
        riverStepSize,
      ),
    [totalWidth, RIVER_Y, AMPLITUDE, WAVELENGTH, riverStepSize],
  );

  // 可视区域裁剪：只渲染屏幕范围 ± 3 张卡片
  const visibleRange = useMemo(() => {
    const visibleLeft = -dragX - PADDING - (CARD_W + CARD_GAP) * 3;
    const visibleRight = -dragX + viewWidth - PADDING + (CARD_W + CARD_GAP) * 3;
    const startIdx = Math.max(0, Math.floor(visibleLeft / (CARD_W + CARD_GAP)));
    const endIdx = Math.min(
      sorted.length,
      Math.ceil(visibleRight / (CARD_W + CARD_GAP)) + 1,
    );
    return { startIdx, endIdx };
  }, [dragX, viewWidth, sorted.length, CARD_W, CARD_GAP, PADDING]);

  const hasActiveFilters = Boolean(selectedCategory || searchQuery.trim());

  // ── 全站无任何文章时的空态 ──
  if (!posts.length) {
    return (
      <div className="w-full py-6 md:py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
          <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
            <Clock className="w-5 h-5 md:w-7 md:h-7 text-sky-600 dark:text-sky-400" />
            <h1 className="text-xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">
              归档
            </h1>
          </div>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 ml-7 md:ml-10">
            时光河流 · 记录每一个瞬间
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 md:py-32 text-slate-400">
          <BookOpen className="w-8 h-8 md:w-12 md:h-12 mb-3 md:mb-4 opacity-40" />
          <p className="text-sm md:text-base">暂无文章</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-6 md:py-12">
      {/* 页头 + 富交互控制面板 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 md:gap-3 mb-1">
              <Clock className="w-5 h-5 md:w-7 md:h-7 text-sky-600 dark:text-sky-400" />
              <h1 className="text-xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">
                归档
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
                {sorted.length} / {posts.length} 篇
              </span>
            </div>
            <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 ml-7 md:ml-10">
              时光长河与经典年表双视图 · 按年份与分类回溯创作足迹
            </p>
          </div>

          {/* 视图切换胶囊 */}
          <div
            role="tablist"
            aria-label="归档视图模式"
            className="inline-flex items-center gap-1 bg-white/60 dark:bg-slate-800/65 backdrop-blur-md border border-white/50 dark:border-white/10 rounded-xl p-1 shadow-sm self-start sm:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "river"}
              onClick={() => setViewMode("river")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                viewMode === "river"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Waves className="w-4 h-4" />
              时光长河
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "classic"}
              onClick={() => setViewMode("classic")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                viewMode === "classic"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <ListOrdered className="w-4 h-4" />
              经典年表
            </button>
          </div>
        </div>

        {/* 控制卡：搜索 + 分类筛选 + 年份快速跳转 + 河流平移按钮 */}
        <div className="rounded-2xl bg-white/60 dark:bg-slate-800/65 backdrop-blur-md border border-white/50 dark:border-white/10 shadow-lg p-3.5 md:p-4 space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            {/* 关键词搜索 */}
            <div className="relative flex-1 md:max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索文章标题或摘要..."
                aria-label="搜索归档文章"
                className="w-full bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-white/10 rounded-xl pl-9 pr-8 py-1.5 text-xs md:text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="清除搜索"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 分类胶囊 */}
            <div className="timeline-scroll flex items-center gap-1.5 overflow-x-auto py-0.5 flex-1">
              <button
                type="button"
                onClick={() => setSelectedCategory("")}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  !selectedCategory
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-white/60 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200 border-slate-200/70 dark:border-white/10 hover:border-sky-500/40"
                }`}
              >
                全部分类
              </button>
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat.name;
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() =>
                      setSelectedCategory((prev) =>
                        prev === cat.name ? "" : cat.name,
                      )
                    }
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                      isSelected
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-white/60 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200 border-slate-200/70 dark:border-white/10 hover:border-sky-500/40"
                    }`}
                  >
                    {cat.name} ({cat.count})
                  </button>
                );
              })}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory("");
                    setSearchQuery("");
                  }}
                  className="shrink-0 px-2 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
                >
                  重置
                </button>
              )}
            </div>
          </div>

          {/* 年份快速跳转胶囊 + 长河左右平移控制 */}
          {yearGroups.length > 0 && (
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200/60 dark:border-white/10">
              <div className="timeline-scroll flex items-center gap-1.5 overflow-x-auto py-0.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0 mr-1">
                  年份跳转:
                </span>
                {yearGroups.map((yg) => {
                  const isCurrent = activeYear === yg.year;
                  return (
                    <button
                      key={yg.year}
                      type="button"
                      onClick={() => handleJumpToYear(yg.year, yg.firstIndex)}
                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                        isCurrent
                          ? "bg-sky-600 text-white shadow-sm"
                          : "bg-slate-900/5 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-sky-500/15 hover:text-sky-700 dark:hover:text-sky-300"
                      }`}
                    >
                      <span>{yg.year}</span>
                      <span
                        className={`text-[10px] px-1 rounded ${
                          isCurrent
                            ? "bg-white/25 text-white"
                            : "bg-slate-500/10 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {yg.posts.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {viewMode === "river" && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => panByStep("left")}
                    aria-label="向左平移时光长河"
                    title="向左平移 (←)"
                    className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => panByStep("right")}
                    aria-label="向右平移时光长河"
                    title="向右平移 (→)"
                    className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 筛选结果为空态 */}
      {sorted.length === 0 ? (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-white/55 dark:bg-slate-800/55 backdrop-blur-md border border-white/50 dark:border-white/10 py-16 px-4 text-center">
            <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-400 opacity-50" />
            <p className="text-sm md:text-base font-medium text-slate-700 dark:text-slate-200">
              没有找到匹配当前筛选条件的文章
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory("");
                setSearchQuery("");
              }}
              className="mt-3 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              重置筛选条件
            </button>
          </div>
        </div>
      ) : viewMode === "river" ? (
        /* ── 视图 1：时光长河 (SVG River) ── */
        <>
          <div
            ref={riverViewportRef}
            className="overflow-hidden pb-4 select-none relative"
          >
            <motion.div
              style={{ x: xMotion }}
              drag="x"
              dragMomentum
              dragElastic={0.08}
              dragConstraints={{
                left: minX,
                right: 0,
              }}
              onDragStart={() => {
                didDrag.current = true;
              }}
              onDragEnd={() => {
                setTimeout(() => {
                  didDrag.current = false;
                }, 100);
              }}
              className="cursor-grab active:cursor-grabbing"
            >
              <svg
                width={totalWidth}
                height={svgHeight}
                viewBox={`0 ${SVG_TOP} ${totalWidth} ${svgHeight}`}
                className="block"
              >
                <defs>
                  <linearGradient
                    id="river-grad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop
                      offset="0%"
                      stopColor={isDark ? "#38bdf8" : "#0284c7"}
                      stopOpacity="0"
                    />
                    <stop
                      offset="4%"
                      stopColor={isDark ? "#38bdf8" : "#0284c7"}
                      stopOpacity={isDark ? "0.65" : "0.85"}
                    />
                    <stop
                      offset="50%"
                      stopColor={isDark ? "#818cf8" : "#4f46e5"}
                      stopOpacity={isDark ? "0.75" : "0.9"}
                    />
                    <stop
                      offset="96%"
                      stopColor={isDark ? "#38bdf8" : "#0284c7"}
                      stopOpacity={isDark ? "0.65" : "0.85"}
                    />
                    <stop
                      offset="100%"
                      stopColor={isDark ? "#38bdf8" : "#0284c7"}
                      stopOpacity="0"
                    />
                  </linearGradient>
                  <linearGradient
                    id="river-grad-sub"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop
                      offset="0%"
                      stopColor={isDark ? "#38bdf8" : "#0284c7"}
                      stopOpacity="0"
                    />
                    <stop
                      offset="10%"
                      stopColor={isDark ? "#38bdf8" : "#0284c7"}
                      stopOpacity={isDark ? "0.3" : "0.45"}
                    />
                    <stop
                      offset="90%"
                      stopColor={isDark ? "#818cf8" : "#4f46e5"}
                      stopOpacity={isDark ? "0.3" : "0.45"}
                    />
                    <stop
                      offset="100%"
                      stopColor={isDark ? "#38bdf8" : "#0284c7"}
                      stopOpacity="0"
                    />
                  </linearGradient>
                  {!isMobile && (
                    <>
                      <filter
                        id="river-glow"
                        x="-5%"
                        y="-20%"
                        width="110%"
                        height="140%"
                      >
                        <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
                      </filter>
                      <filter
                        id="dot-glow"
                        x="-100%"
                        y="-100%"
                        width="300%"
                        height="300%"
                      >
                        <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
                      </filter>
                    </>
                  )}
                </defs>

                {/* 河流主体 */}
                <path
                  d={riverPath}
                  fill="none"
                  stroke="url(#river-grad)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                {/* 河流发光层（PC） */}
                {!isMobile && (
                  <path
                    d={riverPath}
                    fill="none"
                    stroke="url(#river-grad)"
                    strokeWidth="18"
                    filter="url(#river-glow)"
                    opacity={isDark ? "0.32" : "0.22"}
                  />
                )}
                {/* 河流底部副波纹 */}
                <path
                  d={riverPathBottom}
                  fill="none"
                  stroke="url(#river-grad-sub)"
                  strokeWidth="1.5"
                />

                {/* 流动光点粒子（PC） */}
                {!isMobile && (
                  <>
                    {[0, 0.33, 0.66].map((offset, i) => (
                      <circle
                        key={i}
                        r="3.5"
                        fill={isDark ? "#38bdf8" : "#0284c7"}
                        opacity="0.8"
                        filter="url(#dot-glow)"
                      >
                        <animateMotion
                          dur={`${9 + i * 2}s`}
                          repeatCount="indefinite"
                          begin={`${offset * (9 + i * 2)}s`}
                        >
                          <mpath href="#river-flow-path" />
                        </animateMotion>
                      </circle>
                    ))}
                    <path
                      id="river-flow-path"
                      d={riverPath}
                      fill="none"
                      stroke="none"
                    />
                  </>
                )}

                {/* 文章卡片（可视区域裁剪） */}
                {sorted
                  .slice(visibleRange.startIdx, visibleRange.endIdx)
                  .map((post, ri) => {
                    const i = visibleRange.startIdx + ri;
                    const x = PADDING + i * (CARD_W + CARD_GAP);
                    const cx = x + CARD_W / 2;
                    const waveY =
                      RIVER_Y +
                      AMPLITUDE *
                        0.5 *
                        Math.sin((cx / WAVELENGTH) * Math.PI * 2) +
                      AMPLITUDE *
                        0.3 *
                        Math.sin((cx / (WAVELENGTH * 0.6)) * Math.PI * 2 + 1) +
                      AMPLITUDE *
                        0.2 *
                        Math.sin(
                          (cx / (WAVELENGTH * 1.5)) * Math.PI * 2 + 2.5,
                        );

                    const isAbove = i % 2 === 0;
                    const cardY = isAbove
                      ? waveY - (isMobile ? 32 : 50) - CARD_H
                      : waveY + (isMobile ? 32 : 50);
                    const lineStartY = isAbove ? cardY + CARD_H : cardY;
                    const lineEndY = waveY;
                    const catColor = getCatColor(post.category, isDark);
                    const dateStr = formatDate(
                      post.published_at || post.created_at,
                    );

                    return (
                      <g
                        key={post.id}
                        className="cursor-pointer"
                        onClick={() => {
                          if (!didDrag.current) {
                            router.push(`/posts/${post.slug}`);
                          }
                        }}
                      >
                        {/* 连接线 */}
                        <line
                          x1={cx}
                          y1={lineStartY}
                          x2={cx}
                          y2={lineEndY}
                          stroke={catColor}
                          strokeWidth="1.75"
                          opacity={isDark ? "0.55" : "0.7"}
                          strokeDasharray="4 3"
                        />
                        {/* 河流节点外环与实心圆（浅色/深色均高对比） */}
                        <circle
                          cx={cx}
                          cy={waveY}
                          r="11"
                          className="fill-sky-500/20 dark:fill-sky-400/25"
                        />
                        <circle
                          cx={cx}
                          cy={waveY}
                          r="6"
                          className="fill-sky-600 dark:fill-white stroke-white dark:stroke-slate-900"
                          strokeWidth="2"
                        />
                        {/* 时间标注底衬胶囊 + 高对比文字 */}
                        <rect
                          x={cx - (isMobile ? 34 : 42)}
                          y={waveY + (isAbove ? 11 : -25)}
                          width={isMobile ? 68 : 84}
                          height={isMobile ? 16 : 19}
                          rx="8"
                          className="fill-white/80 dark:fill-slate-900/75"
                        />
                        <text
                          x={cx}
                          y={waveY + (isAbove ? 22 : -12)}
                          textAnchor="middle"
                          className="fill-slate-800 dark:fill-slate-100"
                          fontSize={isMobile ? "9.5" : "11"}
                          fontWeight="700"
                        >
                          {dateStr}
                        </text>

                        {/* 卡片 */}
                        <foreignObject
                          x={x}
                          y={cardY}
                          width={CARD_W}
                          height={CARD_H}
                          style={{ overflow: "visible" }}
                        >
                          <div
                            className={`w-full h-full rounded-xl md:rounded-2xl overflow-hidden border border-white/60 dark:border-white/10 shadow-lg hover:border-sky-500/50 transition-all duration-300 group ${
                              isMobile
                                ? "bg-white/85 dark:bg-slate-800/90"
                                : "bg-white/75 dark:bg-slate-800/75 backdrop-blur-xl"
                            }`}
                          >
                            {post.cover ? (
                              <div
                                className="relative overflow-hidden"
                                style={{ height: isMobile ? 70 : 100 }}
                              >
                                <img
                                  src={post.cover}
                                  alt=""
                                  loading="lazy"
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                <div className="absolute bottom-1.5 left-2 md:bottom-2 md:left-3 flex items-center gap-1 text-white/90 text-[9px] md:text-[10px] font-medium">
                                  <Calendar className="w-2.5 h-2.5 md:w-3 md:h-3" />
                                  {dateStr}
                                </div>
                              </div>
                            ) : (
                              <div
                                className="relative bg-gradient-to-br from-sky-50 to-slate-200/80 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center"
                                style={{ height: isMobile ? 70 : 100 }}
                              >
                                <BookOpen className="w-6 h-6 md:w-8 md:h-8 text-slate-400 dark:text-slate-500" />
                                <span className="absolute bottom-1.5 left-2 md:bottom-2 md:left-3 text-[9px] md:text-[10px] font-medium text-slate-600 dark:text-slate-300">
                                  {dateStr}
                                </span>
                              </div>
                            )}
                            <div className="p-2.5 md:p-3">
                              <h3 className="text-[11px] md:text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 mb-1 md:mb-1.5 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors leading-snug">
                                {post.title}
                              </h3>
                              {post.description && (
                                <p className="text-[9px] md:text-[10px] text-slate-600 dark:text-slate-300 line-clamp-2 mb-1.5 md:mb-2 leading-relaxed">
                                  {post.description}
                                </p>
                              )}
                              <div className="flex items-center justify-between">
                                {post.category ? (
                                  <span
                                    className={`text-[8px] md:text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${getCatBgColor(post.category)} ${getCatTextColor(post.category)}`}
                                  >
                                    {post.category}
                                  </span>
                                ) : (
                                  <span />
                                )}
                                <div className="flex items-center gap-1.5 md:gap-2 text-slate-500 dark:text-slate-400 text-[9px] md:text-[10px] tabular-nums">
                                  <span className="flex items-center gap-0.5">
                                    <Eye className="w-2.5 h-2.5 md:w-3 md:h-3" />
                                    {post.views}
                                  </span>
                                  <span className="flex items-center gap-0.5">
                                    <Heart className="w-2.5 h-2.5 md:w-3 md:h-3" />
                                    {post.likes}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </foreignObject>
                      </g>
                    );
                  })}
              </svg>
            </motion.div>
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-6xl mx-auto px-4">
            支持拖拽、鼠标滚轮或键盘 ← → 方向键漫游时光长河 · 点击卡片阅读全文
          </p>
        </>
      ) : (
        /* ── 视图 2：经典年表 (Grouped Vertical Timeline) ── */
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          {yearGroups.map((yg) => (
            <section
              key={yg.year}
              id={`timeline-year-${yg.year}`}
              className="scroll-mt-24"
            >
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tabular-nums">
                  {yg.year}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
                  {yg.posts.length} 篇
                </span>
                <div className="h-px flex-1 bg-slate-300/60 dark:bg-white/10" />
              </div>

              <div className="relative pl-6 md:pl-8 border-l-2 border-sky-500/30 dark:border-sky-400/25 space-y-4">
                {yg.posts.map((post) => {
                  const dateStr = formatDate(
                    post.published_at || post.created_at,
                  );
                  return (
                    <div key={post.id} className="relative group">
                      {/* 时间轴圆点 */}
                      <span className="absolute -left-[31px] md:-left-[39px] top-5 w-3.5 h-3.5 rounded-full bg-sky-600 dark:bg-sky-400 ring-4 ring-white/80 dark:ring-slate-900 group-hover:scale-125 transition-transform" />

                      <Link
                        href={`/posts/${post.slug}`}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-white/65 dark:bg-slate-800/65 backdrop-blur-md border border-white/50 dark:border-white/10 shadow-md p-4 md:p-5 hover:border-sky-500/50 hover:shadow-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <time className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                              {dateStr}
                            </time>
                            {post.category && (
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${getCatBgColor(post.category)} ${getCatTextColor(post.category)}`}
                              >
                                {post.category}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm md:text-base font-bold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors mb-1">
                            {post.title}
                          </h3>
                          {post.description && (
                            <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                              {post.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Eye className="w-3.5 h-3.5" />
                              {post.views} 阅读
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Heart className="w-3.5 h-3.5" />
                              {post.likes} 喜欢
                            </span>
                          </div>
                        </div>

                        {post.cover && (
                          <div className="hidden sm:block w-28 h-20 rounded-xl overflow-hidden shrink-0 border border-slate-200/50 dark:border-white/10">
                            <img
                              src={post.cover}
                              alt=""
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        )}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <style>{`
        .timeline-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .timeline-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
