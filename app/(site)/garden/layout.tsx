"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  LayoutDashboard,
  Orbit,
  CloudRain,
  Sparkles,
  Droplets,
  Flower2,
  Mountain,
  Code2,
  Grid3x3,
  Sigma,
  BarChart3,
  FileText,
  Braces,
  Palette,
  QrCode,
  Star,
  Box,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { href: "/garden", label: "仪表盘", icon: LayoutDashboard },
  { href: "/garden/solar", label: "太阳系", icon: Orbit },
  { href: "/garden/rain", label: "代码雨", icon: CloudRain },
  { href: "/garden/fireworks", label: "烟花", icon: Sparkles },
  { href: "/garden/fluid", label: "流体", icon: Droplets },
  { href: "/garden/kaleidoscope", label: "万花筒", icon: Flower2 },
  { href: "/garden/sand", label: "重力沙子", icon: Mountain },
  { href: "/garden/python", label: "Python", icon: Code2 },
  { href: "/garden/life", label: "生命游戏", icon: Grid3x3 },
  { href: "/garden/math", label: "数学可视化", icon: Sigma },
  { href: "/garden/sorting", label: "排序算法", icon: BarChart3 },
  { href: "/garden/markdown", label: "Markdown", icon: FileText },
  { href: "/garden/json", label: "JSON", icon: Braces },
  { href: "/garden/color", label: "颜色工具", icon: Palette },
  { href: "/garden/studio", label: "3D工作室", icon: Box },
  { href: "/garden/qrcode", label: "二维码", icon: QrCode },
  { href: "/garden/stars", label: "星空", icon: Star },
];

export default function GardenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">(
    "checking",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const unlocked = localStorage.getItem("garden-unlock") === "true";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only access gate
    setAccess(unlocked ? "allowed" : "denied");
    if (!unlocked) router.replace("/");
  }, [router]);

  // Escape 关闭移动端抽屉并锁定背景滚动
  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  if (access !== "allowed") {
    return null;
  }

  const currentNav = navItems.find((item) => item.href === pathname);

  return (
    <div className="min-h-screen flex flex-col md:flex-row -mt-16">
      {/* 侧边栏 - 桌面端 */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-slate-200/60 dark:border-white/5 bg-slate-50/85 dark:bg-slate-900/70 backdrop-blur-xl sticky top-0 h-screen overflow-y-auto">
        <div className="p-5 border-b border-slate-200/60 dark:border-white/5 shrink-0">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            ← 返回主站
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5 text-sky-500"
              >
                <circle cx="12" cy="5" r="3" />
                <line x1="12" y1="8" x2="12" y2="22" />
                <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-white">
                星港
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Star Harbor · 16 项实验
              </p>
            </div>
          </div>
        </div>

        <nav
          aria-label="星港实验导航"
          className="flex-1 p-3 space-y-0.5 overflow-y-auto"
        >
          {navItems.map((nav) => {
            const active = pathname === nav.href;
            return (
              <Link
                key={nav.href}
                href={nav.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  active
                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <nav.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{nav.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* 移动端顶栏（修复 flex-col 垂直堆叠，并提供实验目录抽屉开关） */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-13 border-b border-slate-200/60 dark:border-white/10 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl shrink-0">
        <Link
          href="/"
          className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors inline-flex items-center gap-1 py-1.5 px-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          返回主站
        </Link>

        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5 text-sky-500"
            >
              <circle cx="12" cy="5" r="3" />
              <line x1="12" y1="8" x2="12" y2="22" />
              <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
            </svg>
          </div>
          <span className="text-sm font-bold text-slate-800 dark:text-white truncate">
            星港{currentNav ? ` · ${currentNav.label}` : ""}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="打开实验目录抽屉"
          aria-expanded={drawerOpen}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs font-semibold hover:bg-sky-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <Menu className="w-4 h-4" />
          <span>目录</span>
        </button>
      </header>

      {/* 移动端实验目录抽屉 (Mobile Menu Drawer) */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label="星港实验目录"
            className="fixed inset-0 z-50 md:hidden flex justify-end"
            onClick={() => setDrawerOpen(false)}
          >
            <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-xs" />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-72 max-w-[82vw] h-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-l border-slate-200/60 dark:border-white/10 shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-slate-200/60 dark:border-white/10 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    星港实验目录
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    全部 16 个互动实验与工具
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="关闭实验目录"
                  className="w-8 h-8 rounded-full bg-slate-200/60 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-3 pt-3">
                <Link
                  href="/"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  ← 返回主站首页
                </Link>
              </div>

              <nav
                aria-label="移动端星港实验列表"
                className="flex-1 overflow-y-auto p-3 space-y-1"
              >
                {navItems.map((nav) => {
                  const active = pathname === nav.href;
                  return (
                    <Link
                      key={nav.href}
                      href={nav.href}
                      onClick={() => setDrawerOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        active
                          ? "bg-sky-600 text-white font-semibold shadow-sm"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                      }`}
                    >
                      <nav.icon className="w-4 h-4 shrink-0" />
                      <span>{nav.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 内容区 */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-slate-100/40 dark:bg-slate-950/40">
        {children}
      </main>
    </div>
  );
}
