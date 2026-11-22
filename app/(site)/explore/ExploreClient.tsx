"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { CrossResult } from "@/server/modules/search/cross";

export default function ExploreClient() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<CrossResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const keyword = query.trim();
    if (!keyword) {
      setResult(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search/cross?q=${encodeURIComponent(keyword)}`);
        setResult(response.ok ? ((await response.json()) as CrossResult) : null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 relative z-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">全局搜索</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          一次搜收藏、书架、影视、游戏与新闻（文章搜索仍在导航「搜索」里）
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入关键词，比如：三体 / 星际 / 法环"
          autoFocus
          className="h-12 w-full rounded-2xl border border-white/40 bg-white/55 pl-11 pr-4 text-sm text-slate-800 outline-none backdrop-blur-md placeholder:text-slate-400 focus:border-sky-400 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-100"
        />
      </div>

      {loading && <p className="mt-4 text-sm text-slate-500">搜索中…</p>}

      {!loading && result && result.total === 0 && (
        <p className="mt-6 rounded-2xl border border-white/40 bg-white/40 p-6 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/40">
          没有找到「{result.query}」相关的记录。
        </p>
      )}

      {result?.groups.map((group) => (
        <section key={group.kind} className="mt-6">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-400">
            {group.label}（{group.items.length}）
          </h2>
          <div className="divide-y divide-white/30 overflow-hidden rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:divide-white/10 dark:border-white/10 dark:bg-slate-800/45">
            {group.items.map((item) => (
              <a
                key={`${group.kind}-${item.title}-${item.updated_at}`}
                href={item.href}
                className="block px-4 py-2.5 text-sm hover:text-sky-500"
              >
                <span className="text-slate-800 dark:text-slate-100">{item.title}</span>
                {item.detail && (
                  <span className="ml-2 text-xs text-slate-400">{item.detail}</span>
                )}
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
