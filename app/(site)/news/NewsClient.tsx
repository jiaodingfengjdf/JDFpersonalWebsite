"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Star } from "lucide-react";
import type { FeedCategory, FeedItemView } from "@/server/modules/feed/contracts";

const TABS: Array<{ key: FeedCategory | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "tech", label: "科技" },
  { key: "china", label: "国内" },
  { key: "world", label: "国际" },
  { key: "finance", label: "财经" },
  { key: "design", label: "设计" },
];

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  if (diff < minute) return "刚刚";
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function NewsClient({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<FeedItemView[]>([]);
  const [tab, setTab] = useState<FeedCategory | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "80" });
      if (tab !== "all") params.set("category", tab);
      if (unreadOnly) params.set("unread", "true");
      const response = await fetch(`/api/news?${params.toString()}`);
      const json = await response.json();
      setItems(json.items ?? []);
    } catch {
      setError("加载失败，稍后再试");
    } finally {
      setLoading(false);
    }
  }, [tab, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: number, body: { read?: boolean; starred?: boolean }) {
    await fetch(`/api/admin/news/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...body } : item)));
  }

  const visible = useMemo(() => items, [items]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">新闻流</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            RSS 聚合 · 只存标题与摘要，正文请点进原站
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => setUnreadOnly(event.target.checked)}
            />
            只看未读
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              tab === item.key
                ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300"
                : "border-white/40 bg-white/40 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-rose-500">{error}</p>}

      <div className="divide-y divide-white/30 overflow-hidden rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:divide-white/10 dark:border-white/10 dark:bg-slate-800/45">
        {loading && <p className="px-4 py-6 text-sm text-slate-500">加载中…</p>}
        {!loading && visible.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            还没有条目。{canManage ? "去后台「新闻」点一次抓取。" : "稍后再来看看。"}
          </p>
        )}
        {visible.map((item) => (
          <article key={item.id} className="flex gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  if (canManage && !item.read) void patch(item.id, { read: true });
                }}
                className={`inline-flex items-center gap-1 text-sm font-medium hover:text-sky-500 ${
                  item.read ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-100"
                }`}
              >
                {item.title}
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
              {item.summary && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {item.summary}
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-400">
                {item.source_name} · {timeAgo(item.published_at)}
                {item.read ? " · 已读" : ""}
              </p>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => void patch(item.id, { starred: !item.starred })}
                className={`shrink-0 self-start rounded-full p-1.5 ${
                  item.starred ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
                }`}
                title={item.starred ? "取消星标" : "星标"}
              >
                <Star className={`h-4 w-4 ${item.starred ? "fill-current" : ""}`} />
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
