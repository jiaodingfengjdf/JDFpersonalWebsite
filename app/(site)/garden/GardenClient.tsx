"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Calendar,
  FileText,
  MessageCircle,
  Gamepad2,
  TrendingUp,
  Clock,
  Code2,
  Sparkles,
  Heart,
  Zap,
  Coffee,
  Music,
  Orbit,
  CloudRain,
  Droplets,
  Flower2,
  Mountain,
  Star,
  Box,
  Grid3x3,
  Sigma,
  BarChart3,
  Braces,
  Palette,
  QrCode,
  Search,
  X,
  RotateCcw,
  AlertCircle,
  ArrowUpRight,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import { useSiteSettings } from "@/components/providers/SiteSettingsProvider";
import { getPosts, getPostsCount, type PostItem } from "@/lib/api/posts";
import { getChatters, getChattersCount } from "@/lib/api/chatters";
import { getProjects } from "@/lib/api/projects";
import { getAlbums } from "@/lib/api/albums";

/* ── helpers ── */
function getDaysSince(dateStr: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 864e5));
}

function AnimatedNumber({
  target,
  duration = 1200,
}: {
  target: number;
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (target <= 0) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- 目标值为 0 时同步归零 */
      setCount(0);
      return;
    }
    const t0 = performance.now();

    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const current = Math.round(p * target);
      if (p >= 1) {
        setCount(target);
        return;
      }
      setCount(current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return <span className="tabular-nums">{count}</span>;
}

/* ── data ── */
const quotes = [
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  { text: "过早优化是万恶之源。", author: "Donald Knuth" },
  { text: "简单是可靠的前提。", author: "Edsger Dijkstra" },
  { text: "先让它工作，再让它正确，最后让它快。", author: "Kent Beck" },
  { text: "任何足够先进的技术都与魔法无异。", author: "Arthur C. Clarke" },
  { text: "世界上最危险的一句话就是：一直都是这样做的。", author: "Grace Hopper" },
];

const techStack = [
  { name: "Next.js 16", color: "#0284c7", side: "全栈框架" },
  { name: "React 19", color: "#22d3ee", side: "视图层" },
  { name: "TypeScript", color: "#3b82f6", side: "类型系统" },
  { name: "Tailwind v4", color: "#14b8a6", side: "原子样式" },
  { name: "Drizzle ORM", color: "#84cc16", side: "数据访问" },
  { name: "SQLite", color: "#6366f1", side: "本地存储" },
  { name: "Framer Motion", color: "#ec4899", side: "动效引擎" },
  { name: "Zod", color: "#f59e0b", side: "契约校验" },
];

type ExperimentCategory = "视觉特效" | "算法与编程" | "实用工具";

interface ExperimentItem {
  href: string;
  label: string;
  desc: string;
  category: ExperimentCategory;
  icon: LucideIcon;
  accent: string;
}

const EXPERIMENTS: ExperimentItem[] = [
  // 视觉特效 (8)
  {
    href: "/garden/solar",
    label: "太阳系",
    desc: "三维行星公转轨道与天体比例演示",
    category: "视觉特效",
    icon: Orbit,
    accent: "text-amber-500 bg-amber-500/10",
  },
  {
    href: "/garden/rain",
    label: "代码雨",
    desc: "黑客帝国风格字符流瀑布特效",
    category: "视觉特效",
    icon: CloudRain,
    accent: "text-emerald-500 bg-emerald-500/10",
  },
  {
    href: "/garden/fireworks",
    label: "烟花",
    desc: "点击夜空绽放绚丽物理粒子烟花",
    category: "视觉特效",
    icon: Sparkles,
    accent: "text-rose-500 bg-rose-500/10",
  },
  {
    href: "/garden/fluid",
    label: "流体",
    desc: "WebGL 实时流体动力学色彩模拟",
    category: "视觉特效",
    icon: Droplets,
    accent: "text-cyan-500 bg-cyan-500/10",
  },
  {
    href: "/garden/kaleidoscope",
    label: "万花筒",
    desc: "多轴镜像对称几何光学绘画画板",
    category: "视觉特效",
    icon: Flower2,
    accent: "text-fuchsia-500 bg-fuchsia-500/10",
  },
  {
    href: "/garden/sand",
    label: "重力沙子",
    desc: "落沙物理堆积与色彩交互沙盒",
    category: "视觉特效",
    icon: Mountain,
    accent: "text-orange-500 bg-orange-500/10",
  },
  {
    href: "/garden/stars",
    label: "星空",
    desc: "沉浸式深空星海曲速穿梭体验",
    category: "视觉特效",
    icon: Star,
    accent: "text-indigo-500 bg-indigo-500/10",
  },
  {
    href: "/garden/studio",
    label: "3D工作室",
    desc: "交互式三维几何体与灯光场景预览",
    category: "视觉特效",
    icon: Box,
    accent: "text-sky-500 bg-sky-500/10",
  },
  // 算法与编程 (4)
  {
    href: "/garden/python",
    label: "Python",
    desc: "浏览器端零配置运行 Python 代码",
    category: "算法与编程",
    icon: Code2,
    accent: "text-blue-500 bg-blue-500/10",
  },
  {
    href: "/garden/life",
    label: "生命游戏",
    desc: "康威元胞自动机群落繁衍演化模拟",
    category: "算法与编程",
    icon: Grid3x3,
    accent: "text-teal-500 bg-teal-500/10",
  },
  {
    href: "/garden/math",
    label: "数学可视化",
    desc: "参数方程与极坐标几何曲线绘制",
    category: "算法与编程",
    icon: Sigma,
    accent: "text-violet-500 bg-violet-500/10",
  },
  {
    href: "/garden/sorting",
    label: "排序算法",
    desc: "经典排序算法比较交换过程动态演示",
    category: "算法与编程",
    icon: BarChart3,
    accent: "text-sky-600 bg-sky-500/10",
  },
  // 实用工具 (4)
  {
    href: "/garden/markdown",
    label: "Markdown",
    desc: "双栏实时预览与排版速查编辑器",
    category: "实用工具",
    icon: FileText,
    accent: "text-slate-600 dark:text-slate-300 bg-slate-500/10",
  },
  {
    href: "/garden/json",
    label: "JSON",
    desc: "JSON 格式化、压缩与语法错误校验",
    category: "实用工具",
    icon: Braces,
    accent: "text-amber-600 bg-amber-500/10",
  },
  {
    href: "/garden/color",
    label: "颜色工具",
    desc: "HEX / RGB / HSL 互转与调色阶梯生成",
    category: "实用工具",
    icon: Palette,
    accent: "text-pink-500 bg-pink-500/10",
  },
  {
    href: "/garden/qrcode",
    label: "二维码",
    desc: "自定义文本与网址二维码即时生成下载",
    category: "实用工具",
    icon: QrCode,
    accent: "text-emerald-600 bg-emerald-500/10",
  },
];

const EXPERIMENT_CATEGORIES: Array<"全部" | ExperimentCategory> = [
  "全部",
  "视觉特效",
  "算法与编程",
  "实用工具",
];

/* recharts 约 600KB，图表数据本来就要等客户端 fetch，所以整块延后加载。 */
const GardenCharts = dynamic(() => import("./GardenCharts"), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 h-[17rem] md:h-[19.5rem] rounded-xl bg-slate-200/40 dark:bg-slate-800/40 animate-pulse" />
      <div className="h-[17rem] md:h-[19.5rem] rounded-xl bg-slate-200/40 dark:bg-slate-800/40 animate-pulse" />
    </div>
  ),
});

/* ── animation ── */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const fadeIn = {
  hidden: { opacity: 0, scale: 0.94 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

/* ── page ── */
export default function GardenClient() {
  const [quoteIdx] = useState(() => Math.floor(Math.random() * quotes.length));
  const [mounted] = useState(() => typeof window !== "undefined");

  const [recentPosts, setRecentPosts] = useState<PostItem[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [chatterCount, setChatterCount] = useState(0);
  const [trendData, setTrendData] = useState<
    Array<{ date: string; 文章: number; 说说: number }>
  >([]);
  const [categoryData, setCategoryData] = useState<
    Array<{ name: string; value: number; color: string }>
  >([]);
  const [activePie, setActivePie] = useState<number | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 16 项实验室启动矩阵筛选状态
  const [expCategory, setExpCategory] = useState<"全部" | ExperimentCategory>("全部");
  const [expSearch, setExpSearch] = useState("");

  const { profile } = useSiteSettings();
  const days = getDaysSince(profile.buildDate);
  const q = quotes[quoteIdx];

  // 去重后的单次并发仪表盘拉取（每个接口仅请求一次）
  const loadDashboardData = useCallback(async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const [posts, postsTotal, chatters, chattersTotal, projects, albums] =
        await Promise.all([
          getPosts({ status: "published", page: 1, size: 100 }),
          getPostsCount("published"),
          getChatters({ status: "published", page: 1, size: 100 }),
          getChattersCount("published"),
          getProjects(),
          getAlbums(),
        ]);

      setRecentPosts(posts.slice(0, 6));
      setPostCount(postsTotal.count);
      setChatterCount(chattersTotal.count);

      // 近 10 天趋势统计
      const map = new Map<string, { 文章: number; 说说: number }>();
      posts.forEach((p) => {
        const d = (p.published_at ?? p.created_at).slice(0, 10);
        const entry = map.get(d) ?? { 文章: 0, 说说: 0 };
        entry.文章++;
        map.set(d, entry);
      });
      chatters.forEach((c) => {
        const d = c.created_at.slice(0, 10);
        const entry = map.get(d) ?? { 文章: 0, 说说: 0 };
        entry.说说++;
        map.set(d, entry);
      });
      const days10 = Array.from({ length: 10 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - 9 + i);
        return d.toISOString().slice(0, 10);
      });
      setTrendData(
        days10.map((d) => ({
          date: d.slice(5),
          文章: map.get(d)?.文章 ?? 0,
          说说: map.get(d)?.说说 ?? 0,
        })),
      );

      // 内容分类占比
      const photoCount = albums.reduce((sum, a) => sum + a.photo_count, 0);
      setCategoryData([
        { name: "文章", value: postsTotal.count, color: "#0284c7" },
        { name: "说说", value: chattersTotal.count, color: "#f59e0b" },
        { name: "项目", value: projects.length, color: "#8b5cf6" },
        { name: "照片", value: photoCount, color: "#ec4899" },
      ]);
    } catch {
      setLoadError("部分站点统计数据加载失败，请检查网络连接后重试");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 客户端挂载并发拉取仪表盘统计数据
    void loadDashboardData();
  }, [loadDashboardData]);

  const filteredExperiments = useMemo(() => {
    const query = expSearch.trim().toLowerCase();
    return EXPERIMENTS.filter((item) => {
      if (expCategory !== "全部" && item.category !== expCategory) {
        return false;
      }
      if (!query) return true;
      return (
        item.label.toLowerCase().includes(query) ||
        item.desc.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      );
    });
  }, [expCategory, expSearch]);

  const groupedExperiments = useMemo(() => {
    const groups: Array<{ category: ExperimentCategory; items: ExperimentItem[] }> = [];
    const order: ExperimentCategory[] = ["视觉特效", "算法与编程", "实用工具"];
    for (const cat of order) {
      const items = filteredExperiments.filter((x) => x.category === cat);
      if (items.length > 0) {
        groups.push({ category: cat, items });
      }
    }
    return groups;
  }, [filteredExperiments]);

  const statCards = [
    {
      icon: Calendar,
      label: "运行天数",
      value: days,
      suffix: " 天",
      color: "from-indigo-500 to-indigo-600",
      ring: "ring-indigo-500/20",
    },
    {
      icon: FileText,
      label: "文章",
      value: postCount,
      suffix: " 篇",
      color: "from-sky-500 to-sky-600",
      ring: "ring-sky-500/20",
    },
    {
      icon: MessageCircle,
      label: "说说",
      value: chatterCount,
      suffix: " 条",
      color: "from-amber-500 to-amber-600",
      ring: "ring-amber-500/20",
    },
    {
      icon: Gamepad2,
      label: "互动实验",
      value: EXPERIMENTS.length,
      suffix: " 项",
      color: "from-rose-500 to-rose-600",
      ring: "ring-rose-500/20",
    },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="p-4 md:p-6 lg:p-8 space-y-5 lg:space-y-6 max-w-7xl mx-auto"
    >
      {/* ── top bar ── */}
      <motion.div
        variants={fadeIn}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
      >
        <div>
          <h1 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white">
            星港仪表盘
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            欢迎回来，这里是全站数据概览与 16 项创意实验启动中心
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Clock className="w-3.5 h-3.5" />
          {mounted &&
            new Date().toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
        </div>
      </motion.div>

      {/* ── 错误重试横幅 ── */}
      {loadError && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-xs md:text-sm text-rose-700 dark:text-rose-300"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboardData()}
            disabled={isRefreshing}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            重试加载
          </button>
        </div>
      )}

      {/* ── stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {statCards.map((s) => (
          <motion.div
            key={s.label}
            variants={fadeIn}
            className="bg-white/75 dark:bg-slate-800/55 backdrop-blur-md rounded-xl p-4 md:p-5 border border-slate-200/60 dark:border-white/5 transition-all duration-300 hover:shadow-lg"
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow-lg ring-4 ${s.ring}`}
              >
                <s.icon className="w-5 h-5 text-white" />
              </div>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white">
              <AnimatedNumber target={s.value} />
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-1">
                {s.suffix}
              </span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {s.label}
            </p>
          </motion.div>
        ))}
      </div>

      {/* ── 星港 16 项实验室启动矩阵 (Experiment Launcher Grid) ── */}
      <motion.section
        variants={fadeIn}
        aria-label="星港实验室启动矩阵"
        className="bg-white/75 dark:bg-slate-800/55 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-slate-200/60 dark:border-white/5 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-slate-800 dark:text-white">
                星港 16 项实验室启动矩阵
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                点击任意卡片直达交互实验与开发者工具
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* 分类过滤胶囊 */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-100/80 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/60 dark:border-white/5">
              {EXPERIMENT_CATEGORIES.map((cat) => {
                const active = expCategory === cat;
                const count =
                  cat === "全部"
                    ? EXPERIMENTS.length
                    : EXPERIMENTS.filter((e) => e.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setExpCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                      active
                        ? "bg-sky-600 text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>

            {/* 即时搜索框 */}
            <div className="relative sm:w-52">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={expSearch}
                onChange={(e) => setExpSearch(e.target.value)}
                placeholder="搜索实验名称或功能..."
                aria-label="搜索实验工具"
                className="w-full bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-white/10 rounded-xl pl-8 pr-8 py-1.5 text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              />
              {expSearch && (
                <button
                  type="button"
                  onClick={() => setExpSearch("")}
                  aria-label="清除实验搜索"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {groupedExperiments.length > 0 ? (
          <div className="space-y-5">
            {groupedExperiments.map((group) => (
              <div key={group.category} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {group.category}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-semibold">
                    {group.items.length}
                  </span>
                  <div className="h-px flex-1 bg-slate-200/60 dark:bg-white/5" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {group.items.map((exp) => (
                    <Link
                      key={exp.href}
                      href={exp.href}
                      className="group flex items-start gap-3 p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/50 border border-slate-200/70 dark:border-white/10 hover:border-sky-500/50 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${exp.accent}`}
                      >
                        <exp.icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors truncate">
                            {exp.label}
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                          {exp.desc}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-xs md:text-sm text-slate-500 dark:text-slate-400">
            没有找到匹配「{expSearch}」的实验项目
          </div>
        )}
      </motion.section>

      {/* ── charts row ── */}
      <GardenCharts
        trendData={trendData}
        categoryData={categoryData}
        activePie={activePie}
        onActivePieChange={setActivePie}
      />

      {/* ── bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* recent posts */}
        <motion.div
          variants={fadeIn}
          className="lg:col-span-1 bg-white/75 dark:bg-slate-800/55 backdrop-blur-md rounded-xl p-4 md:p-5 border border-slate-200/60 dark:border-white/5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-sky-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              最近文章
            </h2>
          </div>
          <div className="space-y-2">
            {recentPosts.length > 0 ? (
              recentPosts.map((p) => (
                <Link
                  key={p.id}
                  href={`/posts/${p.slug}`}
                  className="flex items-start gap-3 p-1.5 -mx-1.5 rounded-lg hover:bg-slate-100/80 dark:hover:bg-white/5 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <div className="mt-2 w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0 group-hover:scale-150 transition-transform" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                      {p.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {(p.published_at ?? p.created_at).slice(0, 10)} ·{" "}
                      {p.category || "未分类"} · {p.views} 阅读
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">暂无最近文章</p>
            )}
          </div>
        </motion.div>

        {/* tech stack */}
        <motion.div
          variants={fadeIn}
          className="bg-white/75 dark:bg-slate-800/55 backdrop-blur-md rounded-xl p-4 md:p-5 border border-slate-200/60 dark:border-white/5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Code2 className="w-4 h-4 text-sky-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              技术栈架构
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {techStack.map((t) => (
              <div
                key={t.name}
                className="flex items-center gap-2.5 group cursor-default"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0 group-hover:scale-125 transition-transform"
                  style={{ backgroundColor: t.color }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors truncate">
                    {t.name}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {t.side}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* quote + fun facts */}
        <motion.div
          variants={fadeIn}
          className="bg-white/75 dark:bg-slate-800/55 backdrop-blur-md rounded-xl p-4 md:p-5 border border-slate-200/60 dark:border-white/5 flex flex-col gap-5"
        >
          {/* quote */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                今日语录
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 italic leading-relaxed">
              &ldquo;{q.text}&rdquo;
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 text-right">
              — {q.author}
            </p>
          </div>

          <div className="border-t border-slate-200/60 dark:border-white/5" />

          {/* fun facts */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Heart className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                趣味数据
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  icon: Coffee,
                  label: "咖啡",
                  value: "∞",
                  color: "text-amber-500",
                },
                {
                  icon: Zap,
                  label: "修 Bug",
                  value: "数不清",
                  color: "text-yellow-500",
                },
                {
                  icon: Heart,
                  label: "热爱",
                  value: "100%",
                  color: "text-rose-500",
                },
                {
                  icon: Music,
                  label: "BGM",
                  value: "循环",
                  color: "text-violet-500",
                },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-100/70 dark:bg-slate-700/35"
                >
                  <f.icon className={`w-3.5 h-3.5 ${f.color} shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {f.value}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {f.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── bottom bar ── */}
      <motion.div variants={fadeIn} className="text-center py-2">
        <p className="text-[10px] text-slate-400 dark:text-slate-600">
          悄悄告诉你，这个页面的暗号是 5201314
        </p>
      </motion.div>
    </motion.div>
  );
}
