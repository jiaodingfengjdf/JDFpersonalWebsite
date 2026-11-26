"use client";
/* eslint-disable @next/next/no-img-element -- 项目封面来自后台配置或外链，域名不可预知 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDown,
  BookText,
  ExternalLink,
  FolderGit2,
  Globe,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { ProjectItem } from "@/server/modules/projects/contracts";

interface ProjectsClientProps {
  initialProjects: ProjectItem[];
}

type SortMode = "default" | "name" | "tech";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "default", label: "默认排序" },
  { value: "name", label: "名称 A-Z" },
  { value: "tech", label: "技术栈数量" },
];

function getStatusMeta(status: string, statusLabel: string) {
  if (status === "active") {
    return {
      label: statusLabel || "运行中",
      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    };
  }
  if (status === "archived") {
    return {
      label: statusLabel || "已归档",
      cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
    };
  }
  return {
    label: statusLabel || "开发中",
    cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  };
}

function GithubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

function GiteeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.15a.592.592 0 0 1-.592-.592v-1.482c0-.326.266-.592.592-.592h6.81c.328 0 .593.266.593.592v3.408a4.74 4.74 0 0 1-4.741 4.74H7.11A4.74 4.74 0 0 1 2.37 14.81V9.186a4.74 4.74 0 0 1 4.74-4.741h10.963v.888z" />
    </svg>
  );
}

export default function ProjectsClient({
  initialProjects,
}: ProjectsClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTech, setSelectedTech] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [activeProject, setActiveProject] = useState<ProjectItem | null>(null);
  const [urlHydrated, setUrlHydrated] = useState(false);

  // 从 URL 初始化 ?q= 与 ?tech=，并响应浏览器前进/后退
  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setSearchQuery(params.get("q") ?? "");
      setSelectedTech(params.get("tech") ?? "");
      setUrlHydrated(true);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  // 将搜索词与技术栈筛选同步写回 URL
  useEffect(() => {
    if (!urlHydrated) return;
    const params = new URLSearchParams(window.location.search);
    if (searchQuery.trim()) {
      params.set("q", searchQuery.trim());
    } else {
      params.delete("q");
    }
    if (selectedTech) {
      params.set("tech", selectedTech);
    } else {
      params.delete("tech");
    }
    const qs = params.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [searchQuery, selectedTech, urlHydrated]);

  // 弹窗打开时监听 Escape 并锁定背景滚动
  useEffect(() => {
    if (!activeProject) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveProject(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeProject]);

  // 自动提取高频技术栈（附带项目计数）
  const topTechs = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const p of initialProjects) {
      const seen = new Set<string>();
      for (const rawTag of p.tech_stack) {
        const tag = rawTag.trim();
        if (!tag) continue;
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { label: tag, count: 1 });
        }
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"))
      .slice(0, 14);
  }, [initialProjects]);

  const toggleTechFilter = useCallback((tag: string) => {
    setSelectedTech((prev) =>
      prev.toLowerCase() === tag.toLowerCase() ? "" : tag,
    );
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const techLower = selectedTech.trim().toLowerCase();

    const matched = initialProjects.filter((project) => {
      if (
        techLower &&
        !project.tech_stack.some((tag) => tag.toLowerCase() === techLower)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        project.name.toLowerCase().includes(q) ||
        project.description.toLowerCase().includes(q) ||
        project.long_description?.toLowerCase().includes(q) ||
        project.tech_stack.some((tag) => tag.toLowerCase().includes(q))
      );
    });

    if (sortMode === "name") {
      return [...matched].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }
    if (sortMode === "tech") {
      return [...matched].sort(
        (a, b) =>
          b.tech_stack.length - a.tech_stack.length ||
          a.name.localeCompare(b.name, "zh-CN"),
      );
    }
    return matched;
  }, [initialProjects, searchQuery, selectedTech, sortMode]);

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedTech);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-12 relative z-10">
      {/* 页头 */}
      <div className="mb-5 md:mb-8 text-center md:text-left">
        <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3 justify-center md:justify-start">
          <FolderGit2 className="w-5 h-5 md:w-7 md:h-7 text-sky-600 dark:text-sky-400" />
          <h1 className="text-xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            项目
          </h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
            {filtered.length} / {initialProjects.length}
          </span>
        </div>
        <p className="text-slate-600 dark:text-slate-300 font-medium text-xs md:text-sm">
          从零到一，用代码构建的每一份作品 · 点击卡片可查看完整介绍
        </p>
      </div>

      {/* 搜索栏 + 排序切换 */}
      <div className="mb-4 md:mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 md:w-5 md:h-5 absolute left-3.5 md:left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="搜索项目名称、描述或技术栈..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="搜索项目"
            className="w-full bg-white/55 dark:bg-slate-800/60 backdrop-blur-md border border-white/50 dark:border-white/10 rounded-xl px-4 py-2.5 md:py-3 pl-10 md:pl-11 pr-10 text-slate-900 dark:text-white font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition-all placeholder-slate-500 dark:placeholder-slate-400 text-xs md:text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="清除搜索词"
              title="清除搜索"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 排序切换组 */}
        <div
          role="group"
          aria-label="项目排序方式"
          className="inline-flex items-center gap-1 bg-white/55 dark:bg-slate-800/60 backdrop-blur-md border border-white/50 dark:border-white/10 rounded-xl p-1 shadow-sm self-start sm:self-auto"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 ml-2 mr-0.5 shrink-0" />
          {SORT_OPTIONS.map((opt) => {
            const active = sortMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSortMode(opt.value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  active
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 技术栈筛选胶囊 */}
      {topTechs.length > 0 && (
        <div className="mb-5 md:mb-8 flex flex-wrap items-center gap-1.5 md:gap-2">
          <button
            type="button"
            onClick={() => setSelectedTech("")}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              !selectedTech
                ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                : "bg-white/45 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 border-white/50 dark:border-white/10 hover:border-sky-500/40"
            }`}
          >
            全部 ({initialProjects.length})
          </button>
          {topTechs.map((tech) => {
            const isSelected =
              selectedTech.toLowerCase() === tech.label.toLowerCase();
            return (
              <button
                key={tech.label}
                type="button"
                onClick={() => toggleTechFilter(tech.label)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  isSelected
                    ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                    : "bg-white/45 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 border-white/50 dark:border-white/10 hover:border-sky-500/40"
                }`}
              >
                <span>{tech.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected
                      ? "bg-white/25 text-white"
                      : "bg-slate-500/10 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {tech.count}
                </span>
              </button>
            );
          })}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedTech("");
              }}
              className="px-2.5 py-1 rounded-full text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              重置筛选
            </button>
          )}
        </div>
      )}

      {/* 项目网格 */}
      <motion.div
        layout
        className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"
      >
        <AnimatePresence mode="popLayout">
          {filtered.map((project) => {
            const statusMeta = getStatusMeta(project.status, project.status_label);
            return (
              <motion.div
                layout
                key={project.id}
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -16 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="h-full"
              >
                <article
                  onClick={() => setActiveProject(project)}
                  className="flex flex-col h-full rounded-2xl bg-white/55 dark:bg-slate-800/60 backdrop-blur-md border border-white/50 dark:border-white/10 shadow-xl overflow-hidden transition-all duration-300 hover:scale-[1.01] hover:border-sky-500/40 cursor-pointer group relative p-4 md:p-7"
                >
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-colors duration-500 pointer-events-none" />

                  {/* 标题 + 状态标签 */}
                  <div className="flex items-start justify-between gap-3 mb-3 relative z-10">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h2 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveProject(project);
                            }}
                            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
                          >
                            {project.name}
                          </button>
                        </h2>
                        {project.is_featured && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                            <Sparkles className="w-3 h-3" />
                            精选
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusMeta.cls}`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 描述 */}
                  <p className="text-xs md:text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed line-clamp-3 mb-4 md:mb-5 relative z-10 flex-1">
                    {project.description || "暂无简要描述，点击卡片查看详情。"}
                  </p>

                  {/* 技术栈胶囊（点击切换过滤） */}
                  {project.tech_stack.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 md:gap-2 mb-4 relative z-10">
                      {project.tech_stack.map((tag) => {
                        const isSelected =
                          selectedTech.toLowerCase() === tag.toLowerCase();
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTechFilter(tag);
                            }}
                            title={`按 ${tag} 筛选`}
                            className={`text-[10px] md:text-xs font-bold tracking-wide px-2.5 py-0.5 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                              isSelected
                                ? "bg-sky-600 text-white border-sky-600"
                                : "text-sky-700 dark:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/25"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 底部区分清晰的外链动作栏 */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200/60 dark:border-white/10 relative z-10">
                    <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                      {project.link_github && (
                        <a
                          href={project.link_github}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900/5 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                        >
                          <GithubIcon className="w-3.5 h-3.5" />
                          <span>GitHub</span>
                        </a>
                      )}
                      {project.link_gitee && (
                        <a
                          href={project.link_gitee}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                        >
                          <GiteeIcon className="w-3.5 h-3.5" />
                          <span>Gitee</span>
                        </a>
                      )}
                      {project.link_live && (
                        <a
                          href={project.link_live}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-600 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>预览</span>
                        </a>
                      )}
                      {project.link_docs && (
                        <a
                          href={project.link_docs}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-600 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                        >
                          <BookText className="w-3.5 h-3.5" />
                          <span>文档</span>
                        </a>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors ml-auto">
                      详情 →
                    </span>
                  </div>
                </article>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="col-span-full text-center py-14 md:py-20 rounded-2xl bg-white/45 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 px-4"
          >
            <p className="text-slate-700 dark:text-slate-200 font-semibold text-sm md:text-base mb-2">
              {initialProjects.length === 0
                ? "暂无公开项目"
                : "没有找到符合当前筛选条件的项目"}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedTech("");
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                清除全部筛选条件
              </button>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* 项目详情弹窗 (Glass Modal) */}
      <AnimatePresence>
        {activeProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
            onClick={() => setActiveProject(null)}
          >
            <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 18 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl md:rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/60 dark:border-white/15 shadow-2xl p-5 md:p-8"
            >
              <button
                type="button"
                onClick={() => setActiveProject(null)}
                aria-label="关闭项目详情"
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-slate-200/70 dark:bg-slate-800/80 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <X className="w-4 h-4" />
              </button>

              {activeProject.cover_image && (
                <div className="mb-5 rounded-xl overflow-hidden border border-slate-200/60 dark:border-white/10 max-h-60 bg-slate-100 dark:bg-slate-800">
                  <img
                    src={activeProject.cover_image}
                    alt={activeProject.name}
                    className="w-full h-full max-h-60 object-cover"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pr-10 mb-3">
                <h2
                  id="project-modal-title"
                  className="text-xl md:text-2xl font-black text-slate-900 dark:text-white"
                >
                  {activeProject.name}
                </h2>
                {activeProject.is_featured && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    <Sparkles className="w-3.5 h-3.5" />
                    精选项目
                  </span>
                )}
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    getStatusMeta(activeProject.status, activeProject.status_label).cls
                  }`}
                >
                  {getStatusMeta(activeProject.status, activeProject.status_label).label}
                </span>
              </div>

              <div className="space-y-3 text-sm md:text-base text-slate-700 dark:text-slate-200 leading-relaxed mb-6">
                {activeProject.description && (
                  <p className="font-medium">{activeProject.description}</p>
                )}
                {activeProject.long_description &&
                  activeProject.long_description !== activeProject.description && (
                    <div className="pt-3 border-t border-slate-200/60 dark:border-white/10 text-xs md:text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {activeProject.long_description}
                    </div>
                  )}
              </div>

              {activeProject.tech_stack.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                    技术栈 ({activeProject.tech_stack.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {activeProject.tech_stack.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          toggleTechFilter(tag);
                          setActiveProject(null);
                        }}
                        className="text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-1 rounded-lg border border-sky-500/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 大尺寸操作按钮区 */}
              <div className="flex flex-wrap items-center gap-2.5 pt-4 border-t border-slate-200/60 dark:border-white/10">
                {activeProject.link_live && (
                  <a
                    href={activeProject.link_live}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs md:text-sm font-bold shadow-md shadow-sky-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <Globe className="w-4 h-4" />
                    <span>在线预览</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </a>
                )}
                {activeProject.link_github && (
                  <a
                    href={activeProject.link_github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs md:text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <GithubIcon className="w-4 h-4" />
                    <span>GitHub 源码</span>
                  </a>
                )}
                {activeProject.link_gitee && (
                  <a
                    href={activeProject.link_gitee}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs md:text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <GiteeIcon className="w-4 h-4" />
                    <span>Gitee 仓库</span>
                  </a>
                )}
                {activeProject.link_docs && (
                  <a
                    href={activeProject.link_docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-200 border border-amber-500/30 text-xs md:text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <BookText className="w-4 h-4" />
                    <span>查看文档</span>
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
