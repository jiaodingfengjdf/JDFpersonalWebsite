"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, RefreshCw, Star } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import FilterTabs from "@/components/site/FilterTabs";
import GlassPanel from "@/components/site/GlassPanel";
import { formatRelativeTime } from "@/lib/format";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import type { FeedCategory, FeedItemView } from "@/server/modules/feed/contracts";

function requireModule(href: string): InterestModule {
  const entry = interestModuleByHref(href);
  if (!entry) throw new Error(`Missing interest module: ${href}`);
  return entry;
}

const MODULE = requireModule("/news");

const TABS: Array<{ key: FeedCategory | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "tech", label: "科技" },
  { key: "china", label: "国内" },
  { key: "world", label: "国际" },
  { key: "finance", label: "财经" },
  { key: "design", label: "设计" },
];

const PAGE_SIZE = 20;

type Tab = FeedCategory | "all";

interface NewsQuery {
  tab: Tab;
  unread: boolean;
  starred: boolean;
  offset: number;
}

/** 只需要 get，避免把 ReadonlyURLSearchParams 的具体类型绑进组件。 */
type ParamsLike = { get(name: string): string | null };

function readQuery(params: ParamsLike, canManage: boolean): NewsQuery {
  const tab = TABS.find((entry) => entry.key === params.get("tab"))?.key ?? "all";
  const flag = (name: string) => {
    const value = params.get(name);
    return value === "true" || value === "1";
  };
  const rawOffset = Number(params.get("offset") ?? "0");
  return {
    tab,
    unread: canManage && flag("unread"),
    starred: canManage && flag("starred"),
    offset: Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
  };
}

function NewsClientInner({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 首屏状态直接来自地址栏；后续由本地 state 驱动，router.replace 只负责同步 URL。
  const [query, setQuery] = useState<NewsQuery>(() => readQuery(searchParams, canManage));
  const [items, setItems] = useState<FeedItemView[]>([]);
  const [hasMore, setHasMore] = useState(false);
  // 加载态由「请求键」派生，不在 effect 里同步 setState（避免级联渲染）。
  const [nonce, setNonce] = useState(0);
  const [receivedKey, setReceivedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<number>>(new Set());
  const [updateError, setUpdateError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const resolvedKeyRef = useRef<string | null>(null);

  const { tab, unread, starred, offset } = query;
  const key = `${tab}:${unread}:${starred}:${offset}:${nonce}`;
  const loading = receivedKey !== key && failedKey !== key;
  const error = failedKey === key ? "新闻暂时无法加载，请重试。" : null;

  function applyQuery(patch: Partial<NewsQuery>) {
    const next = { ...query, ...patch };
    setQuery(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next.tab);
    params.set("offset", String(next.offset));
    if (next.unread) params.set("unread", "true");
    else params.delete("unread");
    if (next.starred) params.set("starred", "true");
    else params.delete("starred");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function refresh() {
    // 刷新/重试一律回到第一页，保证 offset>0 的键只表示「加载更多」的追加请求。
    applyQuery({ offset: 0 });
    setNonce((value) => value + 1);
  }

  useEffect(() => {
    // 只在收到响应后标记已解析：StrictMode 的第二次挂载会 abort 首次请求，
    // 若在发请求时就置位，第二次挂载会被早退挡住，界面永久停在「加载中」。
    if (resolvedKeyRef.current === key) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    let active = true;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (tab !== "all") params.set("category", tab);
    if (unread) params.set("unread", "true");
    if (starred) params.set("starred", "true");
    fetch(`/api/news?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("News request failed");
        return (await response.json()) as {
          items?: FeedItemView[];
          hasMore?: boolean;
        };
      })
      .then((json) => {
        if (!active) return;
        const page = json.items ?? [];
        setItems((prev) => (offset === 0 ? page : [...prev, ...page]));
        setHasMore(json.hasMore ?? false);
        resolvedKeyRef.current = key;
        setReceivedKey(key);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        resolvedKeyRef.current = key;
        setFailedKey(key);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, tab, unread, starred, offset]);

  async function patch(id: number, body: { read?: boolean; starred?: boolean }) {
    if (updating.has(id)) return;
    setUpdating((prev) => new Set(prev).add(id));
    setUpdateError(null);
    try {
      const response = await fetch(`/api/admin/news/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("News update failed");
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...body } : item)));
    } catch {
      setUpdateError("保存新闻状态失败，请重试。");
    } finally {
      setUpdating((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  const visible = items.filter((item) => (!unread || !item.read) && (!starred || item.starred));
  const initialLoading = loading && items.length === 0;
  const loadingMore = loading && items.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white md:text-3xl">{MODULE.pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            RSS 聚合 · 只存标题与摘要，正文请点进原站
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={unread}
              onChange={(event) => applyQuery({ unread: event.target.checked, offset: 0 })}
            />
            只看未读
          </label>}
          {canManage && <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={starred}
              onChange={(event) => applyQuery({ starred: event.target.checked, offset: 0 })}
            />
            只看星标
          </label>}
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
        </div>
      </div>

      <FilterTabs
        items={TABS}
        value={tab}
        onChange={(next) => applyQuery({ tab: next, offset: 0 })}
        aria-label="新闻分类"
        className="mb-4"
        tabClassName="text-sm"
        inactiveClassName="bg-white/40 dark:bg-slate-800/40"
      />

      {updateError ? (
        <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {updateError}
        </p>
      ) : null}

      {error ? (
        <AsyncState
          tone="error"
          title={error}
          description="可能是网络暂时的波动，重试一次看看。"
          actionLabel="重试"
          onAction={refresh}
          compact
        />
      ) : (
        <GlassPanel className="divide-y divide-white/30 overflow-hidden dark:divide-white/10">
          {initialLoading && <p role="status" className="px-4 py-6 text-sm text-slate-500">加载中…</p>}
          {!loading && visible.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {unread || starred ? "没有符合筛选条件的新闻。" : canManage ? "还没有条目。可在后台「新闻」抓取订阅。" : "还没有新闻。"}
            </p>
          )}
          {visible.map((item) => {
            const starLabel = item.starred ? "取消星标" : "添加星标";
            const categoryLabel = TABS.find((tabItem) => tabItem.key === item.category)?.label ?? item.category;
            return (
              <article key={item.id} className="flex gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  {/^https?:\/\//i.test(item.link) ? <a
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
                  </a> : <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.title}</span>}
                  {item.summary && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {item.summary}
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-400">
                    <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-600 dark:text-sky-300">
                      {categoryLabel}
                    </span>
                    <span>{item.source_name} · {formatRelativeTime(item.published_at)}</span>
                    {item.read ? <span>· 已读</span> : null}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    disabled={updating.has(item.id)}
                    aria-label={starLabel}
                    aria-pressed={item.starred}
                    onClick={() => void patch(item.id, { starred: !item.starred })}
                    className={`shrink-0 self-start rounded-full p-1.5 ${
                      item.starred ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
                    }`}
                    title={starLabel}
                  >
                    <Star className={`h-4 w-4 ${item.starred ? "fill-current" : ""}`} />
                  </button>
                )}
              </article>
            );
          })}
          {!initialLoading && visible.length > 0 && (
            <div className="px-4 py-3 text-center">
              {loadingMore ? (
                <p role="status" className="text-xs text-slate-500">加载中…</p>
              ) : hasMore ? (
                <button
                  type="button"
                  onClick={() => {
                    if (loading || items.length === 0) return;
                    applyQuery({ offset: offset + items.length });
                  }}
                  className="rounded-full border border-white/40 px-4 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
                >
                  加载更多
                </button>
              ) : (
                <p className="text-[11px] text-slate-400">没有更多了</p>
              )}
            </div>
          )}
        </GlassPanel>
      )}
    </div>
  );
}

/** useSearchParams 需要 Suspense 边界；放在组件内部，避免改动页面文件。 */
export default function NewsClient({ canManage }: { canManage: boolean }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-8 text-sm text-slate-500">加载中…</div>}>
      <NewsClientInner canManage={canManage} />
    </Suspense>
  );
}
