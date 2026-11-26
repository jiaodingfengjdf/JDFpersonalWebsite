"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  BookOpen,
  MessageSquare,
  FolderGit2,
  Camera,
  Clock,
  Music,
  Bookmark,
  type LucideIcon,
} from "lucide-react";
import { INTEREST_MODULES } from "@/lib/interest-modules";
import { navDropdownIcons } from "@/lib/nav-dropdown-icons";

interface RadialItem {
  href: string;
  label: string;
  icon: LucideIcon;
  ring: "inner" | "outer";
}

const coreItems: RadialItem[] = [
  { href: "/", label: "首页", icon: Home, ring: "inner" },
  { href: "/posts", label: "文章", icon: BookOpen, ring: "inner" },
  { href: "/moments", label: "说说", icon: MessageSquare, ring: "inner" },
  { href: "/bookmark", label: "收藏", icon: Bookmark, ring: "inner" },
  { href: "/projects", label: "项目", icon: FolderGit2, ring: "inner" },
  { href: "/photowall", label: "照片墙", icon: Camera, ring: "inner" },
  { href: "/timeline", label: "归档", icon: Clock, ring: "inner" },
  { href: "/music", label: "音乐", icon: Music, ring: "inner" },
];

const interestItems: RadialItem[] = INTEREST_MODULES.map((module) => ({
  href: module.href,
  label: module.label,
  icon: navDropdownIcons[module.icon],
  ring: "outer",
}));

/** 双环径向导航：内圈 8 个核心栏目（r=108px），外圈兴趣模块（r=190px）。 */
const navItems: RadialItem[] = [...coreItems, ...interestItems];

const INNER_RADIUS = 108;
const OUTER_RADIUS = 190;
const DEAD_ZONE_RADIUS = 30;
const RING_BOUNDARY_RADIUS = (INNER_RADIUS + OUTER_RADIUS) / 2;

const INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [tabindex]:not([tabindex="-1"])';

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));
}

function getItemPosition(index: number, cx: number, cy: number) {
  const isInner = index < coreItems.length;
  const ringIndex = isInner ? index : index - coreItems.length;
  const ringCount = isInner ? coreItems.length : interestItems.length;
  const radius = isInner ? INNER_RADIUS : OUTER_RADIUS;
  const angle = (ringIndex / ringCount) * 2 * Math.PI - Math.PI / 2;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
    isInner,
  };
}

export default function RadialMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const lastMouse = useRef({ x: 0, y: 0 });
  const shortcutArmed = useRef(false);

  const getActiveIndex = useCallback(
    (mouseX: number, mouseY: number) => {
      const distFromCenter = Math.hypot(mouseX - center.x, mouseY - center.y);
      if (distFromCenter < DEAD_ZONE_RADIUS) return -1;

      const selectOuter = distFromCenter >= RING_BOUNDARY_RADIUS && interestItems.length > 0;
      const startIdx = selectOuter ? coreItems.length : 0;
      const endIdx = selectOuter ? navItems.length : coreItems.length;

      let minDist = Infinity;
      let closest = -1;
      for (let i = startIdx; i < endIdx; i++) {
        const pos = getItemPosition(i, center.x, center.y);
        const d = Math.hypot(mouseX - pos.x, mouseY - pos.y);
        if (d < minDist) {
          minDist = d;
          closest = i;
        }
      }
      return closest;
    },
    [center.x, center.y],
  );

  const closeMenu = useCallback(() => {
    shortcutArmed.current = false;
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const navigateToIndex = useCallback(
    (index: number) => {
      const target = navItems[index];
      closeMenu();
      if (target) {
        router.push(target.href);
      }
    },
    [closeMenu, router],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (open) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closeMenu();
          return;
        }
        if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) {
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % navItems.length);
          return;
        }
        if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) {
          e.preventDefault();
          setActiveIndex((prev) => (prev <= 0 ? navItems.length - 1 : prev - 1));
          return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((prev) => {
            if (prev < 0) return 0;
            if (prev < coreItems.length) {
              const mapped = Math.min(coreItems.length + prev, navItems.length - 1);
              return mapped;
            }
            return Math.min(prev - coreItems.length, coreItems.length - 1);
          });
          return;
        }
        if (e.key === "Enter" && activeIndex >= 0) {
          e.preventDefault();
          navigateToIndex(activeIndex);
          return;
        }
      }

      // 未打开时绝不劫持 Tab，且让 Ctrl/⌘ + Shift + K 留给全局命令面板。
      if (e.key === "Tab") return;
      const isShortcut =
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "k";
      if (!isShortcut) return;

      if (
        isInteractiveTarget(e.target) ||
        isInteractiveTarget(document.activeElement)
      ) {
        return;
      }

      e.preventDefault();
      shortcutArmed.current = true;
      if (!e.repeat) {
        const hasMouse = lastMouse.current.x > 0 || lastMouse.current.y > 0;
        const rawX = hasMouse ? lastMouse.current.x : window.innerWidth / 2;
        const rawY = hasMouse ? lastMouse.current.y : window.innerHeight / 2;
        setCenter({ x: rawX, y: rawY });
        setOpen(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!shortcutArmed.current) return;
      if (e.key.toLowerCase() !== "k" && e.key !== "Control" && e.key !== "Meta") {
        return;
      }
      shortcutArmed.current = false;
      if (activeIndex >= 0) {
        router.push(navItems[activeIndex].href);
      }
      setOpen(false);
      setActiveIndex(-1);
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastMouse.current = { x: e.clientX, y: e.clientY };
      if (open) {
        setActiveIndex(getActiveIndex(e.clientX, e.clientY));
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [open, activeIndex, getActiveIndex, closeMenu, navigateToIndex, router]);

  useEffect(() => {
    if (open && activeIndex >= 0) {
      window.dispatchEvent(
        new CustomEvent("radial-nav-hover", {
          detail: { label: navItems[activeIndex].label },
        }),
      );
    }
  }, [open, activeIndex]);

  if (pathname.startsWith("/garden")) return null;

  const cx = center.x;
  const cy = center.y;
  const activeItem = activeIndex >= 0 ? navItems[activeIndex] : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-label="双环快捷导航"
          onClick={closeMenu}
          className="fixed inset-0 z-[9999] bg-slate-950/45 backdrop-blur-[2px]"
        >
          {/* 外环轨道辅助线 */}
          <div
            className="pointer-events-none absolute rounded-full border border-white/20 dark:border-white/15"
            style={{
              left: cx - OUTER_RADIUS,
              top: cy - OUTER_RADIUS,
              width: OUTER_RADIUS * 2,
              height: OUTER_RADIUS * 2,
            }}
          />

          {/* 内环轨道辅助线 */}
          <div
            className="pointer-events-none absolute rounded-full border border-sky-300/30 dark:border-sky-400/20"
            style={{
              left: cx - INNER_RADIUS,
              top: cy - INNER_RADIUS,
              width: INNER_RADIUS * 2,
              height: INNER_RADIUS * 2,
            }}
          />

          {/* 中心指示核 */}
          <div
            className="pointer-events-none absolute flex flex-col items-center justify-center rounded-full border border-white/40 bg-white/85 px-2 text-center shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-slate-900/85"
            style={{
              left: cx - 38,
              top: cy - 38,
              width: 76,
              height: 76,
            }}
          >
            <span className="max-w-[64px] truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
              {activeItem ? activeItem.label : "快捷导航"}
            </span>
            <span className="text-[10px] text-sky-600 dark:text-sky-400">
              {activeItem
                ? activeItem.ring === "inner"
                  ? "核心栏目"
                  : "兴趣模块"
                : "内圈 · 外圈"}
            </span>
          </div>

          {/* 双环菜单项 */}
          {navItems.map((item, i) => {
            const { x, y, isInner } = getItemPosition(i, cx, cy);
            const isActive = i === activeIndex;
            const isCurrentRoute =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            const tileHalf = isInner ? 24 : 26;

            return (
              <motion.button
                type="button"
                key={item.href}
                initial={{ scale: 0, x: cx - tileHalf, y: cy - tileHalf }}
                animate={{ scale: 1, x: x - tileHalf, y: y - tileHalf }}
                exit={{ scale: 0, x: cx - tileHalf, y: cy - tileHalf }}
                transition={{
                  type: "spring",
                  stiffness: 420,
                  damping: 26,
                  delay: (i % 10) * 0.015,
                }}
                data-radial-nav={item.label}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToIndex(i);
                }}
                className="absolute flex flex-col items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-2xl cursor-pointer"
              >
                <div
                  className={`${
                    isInner ? "w-12 h-12" : "w-[52px] h-[52px]"
                  } rounded-2xl flex items-center justify-center border transition-all duration-100 ${
                    isActive
                      ? "bg-sky-600 border-sky-300 shadow-lg shadow-sky-500/50 scale-115"
                      : isCurrentRoute
                        ? "bg-sky-50/90 dark:bg-sky-950/85 border-sky-400/60 backdrop-blur-md"
                        : "bg-white/85 dark:bg-slate-900/85 border-white/40 dark:border-white/15 backdrop-blur-md hover:bg-white dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 ${
                      isActive
                        ? "text-white"
                        : isCurrentRoute
                          ? "text-sky-600 dark:text-sky-400"
                          : "text-slate-700 dark:text-slate-200"
                    }`}
                  />
                </div>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap transition-all duration-100 ${
                    isActive
                      ? "bg-sky-600 text-white shadow scale-105"
                      : "bg-slate-900/55 text-white/90 backdrop-blur-xs"
                  }`}
                >
                  {item.label}
                </span>
              </motion.button>
            );
          })}

          {/* 底部操作提示 */}
          <div
            className="pointer-events-none absolute rounded-full border border-white/20 bg-slate-900/75 px-3.5 py-1 text-xs text-white/85 backdrop-blur-md whitespace-nowrap"
            style={{
              left: cx,
              top: Math.min(
                typeof window !== "undefined" ? window.innerHeight - 40 : cy + OUTER_RADIUS + 48,
                cy + OUTER_RADIUS + 48,
              ),
              transform: "translateX(-50%)",
            }}
          >
            松开 Ctrl / ⌘ + K 跳转 · ← / → / Tab 切换 · Esc 取消
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
