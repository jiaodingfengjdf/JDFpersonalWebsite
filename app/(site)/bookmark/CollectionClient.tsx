"use client";
/* eslint-disable @next/next/no-img-element -- 封面来自后台上传或外链，域名不可预知 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bookmark, ExternalLink, Search, Star } from "lucide-react";
import type { CollectionItem, CollectionKind } from "@/server/modules/collection/contracts";

const KIND_TABS: Array<{ key: CollectionKind | "all"; label: string; emoji: string }> = [
  { key: "all", label: "全部", emoji: "✦" },
  { key: "link", label: "站点", emoji: "🔗" },
  { key: "movie", label: "影视", emoji: "🎬" },
  { key: "music", label: "音乐", emoji: "🎵" },
  { key: "book", label: "书籍", emoji: "📚" },
  { key: "product", label: "好物", emoji: "🛒" },
  { key: "idea", label: "灵感", emoji: "💡" },
];

const STATUS_LABEL: Record<string, string> = {
  saved: "收藏",
  doing: "进行中",
  done: "已完成",
  dropped: "搁置",
};

function coverOf(item: CollectionItem): string {
  if (item.cover) return item.cover;
  if (item.kind === "link" && item.url) {
    try {
      return `${new URL(item.url).origin}/favicon.ico`;
    } catch {
      return "";
    }
  }
  return "";
}

function Stars({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" title={`${value} 星`}>
      {Array.from({ length: value }).map((_, index) => (
        <Star key={index} className="h-3 w-3 fill-current" />
      ))}
    </span>
  );
}

export default function CollectionClient({
  items,
  counts,
  categories,
}: {
  items: CollectionItem[];
  counts: Record<string, number>;
  categories: Array<{ id: number; name: string }>;
}) {
  const [kind, setKind] = useState<CollectionKind | "all">("all");
  const [category, setCategory] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return items.filter((item) => {
      if (kind !== "all" && item.kind !== kind) return false;
      if (category !== "all" && item.category_id !== category) return false;
      if (!keyword) return true;
      return [item.title, item.author, item.note, item.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [items, kind, category, query]);

  const total = items.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 relative z-10 sm:px-6 md:py-12 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 md:mb-10"
      >
        <div className="flex items-center gap-3">
          <Bookmark className="h-7 w-7 text-sky-500 md:h-8 md:w-8" />
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white md:text-3xl">收藏中心</h1>
        </div>
        <p className="ml-10 mt-2 text-sm text-slate-500 dark:text-slate-400 md:ml-11 md:text-base">
          站点、影视、音乐、书、好物、灵感，都收在这里 · 共 {total} 条
        </p>
      </motion.div>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {KIND_TABS.map((tab) => {
            const count = tab.key === "all" ? total : (counts[tab.key] ?? 0);
            const active = kind === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setKind(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300"
                    : "border-white/40 bg-white/40 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300"
                }`}
              >
                <span aria-hidden>{tab.emoji}</span>
                {tab.label}
                <span className="text-xs opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {categories.length > 0 && (
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value === "all" ? "all" : Number(event.target.value))
              }
              className="h-9 rounded-full border border-white/40 bg-white/50 px-3 text-sm text-slate-700 outline-none dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200"
            >
              <option value="all">全部分类</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜标题、标签、备注…"
              className="h-9 w-48 rounded-full border border-white/40 bg-white/50 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/40 bg-white/40 p-12 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
          这里还空着 —— 去后台「收藏」添加第一条吧。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item, index) => {
            const cover = coverOf(item);
            const badge = KIND_TABS.find((tab) => tab.key === item.kind);
            return (
              <motion.article
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.3) }}
                className="group flex gap-3 rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-800/45"
              >
                <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-200/60 dark:bg-slate-700/60">
                  <div className="grid h-full w-full place-items-center text-lg">{badge?.emoji ?? "✦"}</div>
                  {cover && (
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-sky-500"
                        >
                          {item.title}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      ) : (
                        item.title
                      )}
                    </h2>
                    <Stars value={item.rating} />
                  </div>

                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {[badge?.label, item.author, item.category_name, STATUS_LABEL[item.status]]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  {item.note && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.note}
                    </p>
                  )}

                  {item.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-600 dark:text-sky-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </div>
  );
}
