"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Search, Tag, Wallet, X } from "lucide-react";
import FilterTabs from "@/components/site/FilterTabs";
import { formatMoney, formatMonthDay } from "@/lib/format";
import type { LedgerKind, LedgerTransaction } from "@/server/modules/ledger/contracts";

type KindFilter = "all" | LedgerKind;

export default function LedgerTransactionsClient({
  month,
  initialItems,
  initialTotal,
}: {
  month: string;
  initialItems: LedgerTransaction[];
  initialTotal: number;
}) {
  const [items, setItems] = useState<LedgerTransaction[]>(initialItems);
  const [total, setTotal] = useState<number>(initialTotal);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (!keyword) return true;
      return (
        item.category_name.toLowerCase().includes(keyword) ||
        item.account_name.toLowerCase().includes(keyword) ||
        item.merchant.toLowerCase().includes(keyword) ||
        item.note.toLowerCase().includes(keyword) ||
        item.tags.some((tag) => tag.toLowerCase().includes(keyword))
      );
    });
  }, [items, kindFilter, query]);

  async function handleLoadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const response = await fetch(
        `/api/admin/ledger/transactions?month=${encodeURIComponent(month)}&limit=50&offset=${items.length}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = (await response.json()) as {
        items: LedgerTransaction[];
        total: number;
      };
      setItems((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        const appended = next.items.filter((row) => !seen.has(row.id));
        return [...prev, ...appended];
      });
      setTotal(next.total);
    } catch {
      setLoadError("加载更多流水失败，请点击重试。");
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = items.length < total;
  const isFiltered = kindFilter !== "all" || query.trim() !== "";

  return (
    <section
      aria-labelledby="ledger-tx-title"
      className="mt-6 rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/30 px-4 py-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <h2 id="ledger-tx-title" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            本月流水
          </h2>
          <span className="text-xs tabular-nums text-slate-400">
            {isFiltered
              ? `匹配 ${visible.length} 笔（已加载 ${items.length}/${total}）`
              : `已加载 ${items.length} / 共 ${total} 笔`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterTabs
            items={[
              { key: "all" as const, label: "全部" },
              { key: "expense" as const, label: "支出" },
              { key: "income" as const, label: "收入" },
            ]}
            value={kindFilter}
            onChange={(next) => setKindFilter(next)}
            variant="segmented"
            aria-label="流水收支筛选"
          />

          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜分类、商户、备注、标签"
              aria-label="搜索流水"
              className="h-8 w-44 rounded-full border border-white/40 bg-white/60 pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 sm:w-52"
            />
            {query && (
              <button
                type="button"
                aria-label="清除流水搜索"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                className="absolute right-1.5 grid h-5 w-5 place-items-center rounded-full text-slate-400 hover:bg-slate-500/10 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-white/30 dark:divide-white/10">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            本月还没有流水。
            <Link href="/admin/ledger" className="ml-1 text-sky-600 underline dark:text-sky-300">
              去记一笔
            </Link>
          </p>
        ) : visible.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            已加载流水中没有匹配的条目。
            {hasMore ? "可点击下方加载更多流水继续查找。" : ""}
          </div>
        ) : (
          visible.map((item) => (
            <div key={item.id} className="flex items-start gap-3 px-4 py-3 text-sm">
              <span className="mt-0.5 w-12 shrink-0 tabular-nums text-xs text-slate-400">
                {formatMonthDay(item.occurred_at)}
              </span>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {item.category_name || "未分类"}
                  </span>
                  {item.merchant && (
                    <span className="truncate text-slate-600 dark:text-slate-300">
                      · {item.merchant}
                    </span>
                  )}
                  {item.account_name && (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-500/10 px-1.5 py-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Wallet className="h-2.5 w-2.5" />
                      {item.account_name}
                    </span>
                  )}
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-700 dark:text-sky-300"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>

                {item.note && (
                  <p className="break-words text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {item.note}
                  </p>
                )}
              </div>

              <span
                className={`shrink-0 tabular-nums font-semibold ${
                  item.kind === "income" ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatMoney(item.kind === "income" ? item.amount : -item.amount, { sign: true })}
              </span>
            </div>
          ))
        )}
      </div>

      {(hasMore || loadError) && (
        <div className="flex flex-col items-center gap-2 border-t border-white/30 px-4 py-3 dark:border-white/10">
          {loadError && <p className="text-xs text-rose-500">{loadError}</p>}
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/60 bg-sky-500/10 px-4 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-sky-300"
          >
            {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {loadingMore
              ? "加载中…"
              : `加载更多流水（剩余 ${Math.max(0, total - items.length)} 笔）`}
          </button>
        </div>
      )}
    </section>
  );
}
