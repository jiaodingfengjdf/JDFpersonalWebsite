"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Clapperboard, Command, FileText, Search, TrendingUp, X } from "lucide-react";

/** 彩蛋暗号：输入后解锁花园。其余输入都当作站内搜索关键词。 */
const GARDEN_PASSWORD = "5201314";

const QUICK_PILLS = [
  { label: "文章", href: "/posts", icon: FileText },
  { label: "书架", href: "/library", icon: BookOpen },
  { label: "行情", href: "/market", icon: TrendingUp },
  { label: "影视", href: "/watch", icon: Clapperboard },
] as const;

export default function SearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const query = value.trim();
    if (!query) {
      router.push("/search");
      return;
    }

    if (query === GARDEN_PASSWORD) {
      localStorage.setItem("garden-unlock", "true");
      router.push("/garden");
      setValue("");
      return;
    }

    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  }

  const trimmed = value.trim();
  const fullSearchHref =
    trimmed && trimmed !== GARDEN_PASSWORD
      ? `/search?q=${encodeURIComponent(trimmed)}`
      : "/search";

  return (
    <div className="w-full max-w-2xl mx-auto mb-6 md:mb-10">
      <form
        className="relative group"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <input
          ref={inputRef}
          type="search"
          className="w-full pl-12 sm:pl-14 pr-28 sm:pr-32 py-3.5 sm:py-4 bg-white/45 dark:bg-slate-800/45 backdrop-blur-xl border border-white/40 dark:border-white/10 rounded-3xl shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 text-slate-800 dark:text-slate-100 transition-all placeholder-slate-500 dark:placeholder-slate-400 font-medium text-base sm:text-lg [&::-webkit-search-cancel-button]:appearance-none"
          placeholder="搜索文章、书影音、行情，或输入暗号…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="站内搜索"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          aria-label="搜索"
          className="absolute inset-y-0 left-0 pl-4 sm:pl-5 flex items-center z-10 cursor-pointer rounded-l-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
        >
          <Search className="w-5 h-5 text-slate-500 dark:text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
        </button>

        <div className="absolute inset-y-0 right-3 flex items-center gap-1.5 z-10">
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setValue("");
                inputRef.current?.focus();
              }}
              aria-label="清空搜索词"
              title="清空"
              className="p-1.5 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="打开快捷命令面板 (快捷键 / 或 Ctrl+Shift+K)"
            title="打开全局命令面板 (/ 或 ⌘⇧K)"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-slate-700/60 hover:bg-white/85 dark:hover:bg-slate-700 border border-white/50 dark:border-white/10 shadow-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <Command className="w-3 h-3 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            <kbd className="font-mono text-[11px]">/</kbd>
            <span className="hidden sm:inline text-[11px] text-slate-400 dark:text-slate-400">
              ⌘⇧K
            </span>
          </button>
        </div>
      </form>

      {/* 快捷跳转胶囊 */}
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        {QUICK_PILLS.map((pill) => {
          const Icon = pill.icon;
          return (
            <Link
              key={pill.href}
              href={pill.href}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium text-slate-600 dark:text-slate-300 bg-white/45 dark:bg-slate-800/45 hover:bg-white/75 dark:hover:bg-slate-700/70 hover:text-sky-600 dark:hover:text-sky-300 border border-white/40 dark:border-white/10 backdrop-blur-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <Icon className="w-3 h-3 opacity-75" aria-hidden="true" />
              <span>{pill.label}</span>
            </Link>
          );
        })}
        <Link
          href={fullSearchHref}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/30 dark:border-indigo-400/20 backdrop-blur-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <Search className="w-3 h-3" aria-hidden="true" />
          <span>全站搜索</span>
        </Link>
      </div>
    </div>
  );
}
