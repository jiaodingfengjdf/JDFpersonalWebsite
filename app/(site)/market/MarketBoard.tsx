"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Briefcase,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import FilterTabs from "@/components/site/FilterTabs";
import { formatClock } from "@/lib/format";
import { describeSiteAdminError, siteAdminRequest } from "@/lib/site-admin-request";
import type {
  MarketCurrencyTotals,
  MarketHistory,
  MarketIndexItem,
  MarketOverview,
  MarketPeriod,
  MarketQuoteItem,
} from "@/server/modules/market/contracts";
import MarketChart from "./MarketChart";
import { MarketAddModal, MarketAlertModal, MarketHoldingModal } from "./MarketAdminModals";
import {
  compactAmount,
  compactMarketCap,
  compactVolume,
  formatSignedPct,
  formatSignedPoint,
  indexBadgeLabel,
  KIND_LABEL,
  MARKET_LABEL,
  money,
  trendClass,
} from "./market-format";

type Filter = "all" | "cn" | "us" | "fund";
type IndexGroup = "all" | "cn" | "us";
type SortMode = "default" | "up" | "down" | "value" | "profit";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "cn", label: "A股" },
  { key: "us", label: "美股" },
  { key: "fund", label: "基金" },
];

const INDEX_GROUPS: Array<{ key: IndexGroup; label: string }> = [
  { key: "all", label: "全部" },
  { key: "cn", label: "A股与港股" },
  { key: "us", label: "美股" },
];

const PERIODS: Array<{ key: MarketPeriod; label: string; hint: string }> = [
  { key: "intraday", label: "分时", hint: "当日一分钟走势" },
  { key: "day", label: "日K", hint: "前复权日线" },
  { key: "week", label: "周K", hint: "日线按自然周聚合" },
  { key: "month", label: "月K", hint: "日线按自然月聚合" },
];

export default function MarketBoard({
  items,
  totals,
  indices,
  initialSymbol,
  initialPeriod,
  initialFilter,
  initialHistory,
  isAdmin,
}: {
  items: MarketQuoteItem[];
  totals: MarketCurrencyTotals[];
  indices: MarketIndexItem[];
  initialSymbol: number | null;
  initialPeriod: MarketPeriod;
  initialFilter: Filter;
  /** 服务端已取好的首屏历史，避免默认标的/周期在客户端再请求一次。 */
  initialHistory?: MarketHistory | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [liveOverview, setLiveOverview] = useState<{
    baseItems: MarketQuoteItem[];
    items: MarketQuoteItem[];
    totals: MarketCurrencyTotals[];
  } | null>(null);
  const watchItems =
    liveOverview && liveOverview.baseItems === items ? liveOverview.items : items;
  const currencyTotals =
    liveOverview && liveOverview.baseItems === items ? liveOverview.totals : totals;

  const [indexGroup, setIndexGroup] = useState<IndexGroup>("all");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [symbolId, setSymbolId] = useState<number | null>(
    initialSymbol ?? items[0]?.id ?? null,
  );
  const [period, setPeriod] = useState<MarketPeriod>(initialPeriod);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // 管理员快捷弹窗与删表确认状态（仅 isAdmin 为 true 时渲染或触发）
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [holdingModalOpen, setHoldingModalOpen] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);

  // 首屏历史由服务端随页面带下来，键必须与客户端派生的请求键完全一致。
  const initialItemId = initialSymbol ?? items[0]?.id ?? null;
  const initialItem = items.find((item) => item.id === initialItemId);
  const initialActivePeriod: MarketPeriod =
    initialItem?.kind === "fund" && initialPeriod === "intraday" ? "day" : initialPeriod;
  const initialResult =
    initialHistory && initialItemId !== null
      ? { key: `${initialItemId}:${initialActivePeriod}:0`, data: initialHistory }
      : null;

  // 以「请求键」判定加载态：不在 effect 里同步 setState，避免级联渲染。
  const [result, setResult] = useState<{ key: string; data: MarketHistory } | null>(initialResult);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const resolvedKeyRef = useRef<string | null>(initialResult?.key ?? null);

  const visibleIndices = useMemo(() => {
    if (indexGroup === "all") return indices;
    return indices.filter((item) => item.market === indexGroup);
  }, [indices, indexGroup]);

  const watchIndexByCode = useMemo(() => {
    const map = new Map<string, MarketQuoteItem>();
    for (const item of watchItems) {
      if (item.kind === "index") {
        map.set(item.code.toUpperCase(), item);
      }
    }
    return map;
  }, [watchItems]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const filtered = watchItems.filter((item) => {
      const inFilter =
        filter === "all"
          ? true
          : filter === "us"
            ? item.market === "us"
            : filter === "fund"
              ? item.kind === "fund"
              : item.market === "cn" && item.kind !== "fund";
      if (!inFilter) return false;
      if (!keyword) return true;
      return item.name.toLowerCase().includes(keyword) || item.code.toLowerCase().includes(keyword);
    });

    if (sortMode === "default") return filtered;

    return [...filtered].sort((a, b) => {
      if (sortMode === "up") {
        const aVal = a.price > 0 ? a.change_pct : -Infinity;
        const bVal = b.price > 0 ? b.change_pct : -Infinity;
        return bVal - aVal;
      }
      if (sortMode === "down") {
        const aVal = a.price > 0 ? a.change_pct : Infinity;
        const bVal = b.price > 0 ? b.change_pct : Infinity;
        return aVal - bVal;
      }
      if (sortMode === "value") {
        return (b.market_value ?? -Infinity) - (a.market_value ?? -Infinity);
      }
      if (sortMode === "profit") {
        return (b.profit ?? -Infinity) - (a.profit ?? -Infinity);
      }
      return 0;
    });
  }, [watchItems, filter, query, sortMode]);

  const breadth = useMemo(() => {
    let up = 0;
    let down = 0;
    let flat = 0;
    for (const item of visible) {
      if (item.price <= 0 || item.change_pct === 0) flat += 1;
      else if (item.change_pct > 0) up += 1;
      else down += 1;
    }
    const total = visible.length;
    return {
      up,
      down,
      flat,
      upPct: total > 0 ? (up / total) * 100 : 0,
      flatPct: total > 0 ? (flat / total) * 100 : 0,
      downPct: total > 0 ? (down / total) * 100 : 0,
    };
  }, [visible]);

  const movers = useMemo(() => {
    let topGainer: MarketQuoteItem | null = null;
    let topLoser: MarketQuoteItem | null = null;
    for (const item of visible) {
      if (item.price <= 0) continue;
      if (item.change_pct > 0 && (!topGainer || item.change_pct > topGainer.change_pct)) {
        topGainer = item;
      }
      if (item.change_pct < 0 && (!topLoser || item.change_pct < topLoser.change_pct)) {
        topLoser = item;
      }
    }
    return { topGainer, topLoser };
  }, [visible]);

  // 切换市场筛选后自动落到当前可见列表首只；无匹配时返回 null，避免指向不可见的标的。
  const selected = useMemo(
    () => visible.find((item) => item.id === symbolId) ?? visible[0] ?? null,
    [visible, symbolId],
  );

  // 基金没有分时，统一按日线展示；不改用户选的周期，切回股票时仍生效。
  const activePeriod: MarketPeriod =
    selected?.kind === "fund" && period === "intraday" ? "day" : period;
  const activeSymbol = selected?.id ?? null;
  const requestKey = activeSymbol ? `${activeSymbol}:${activePeriod}:${nonce}` : "";
  const history = result && result.key === requestKey ? result.data : null;
  const loading = Boolean(activeSymbol) && result?.key !== requestKey && failedKey !== requestKey;
  const error = activeSymbol && failedKey === requestKey ? "历史行情加载失败，稍后重试或切换周期。" : null;

  useEffect(() => {
    if (!activeSymbol) return;
    const key = `${activeSymbol}:${activePeriod}:${nonce}`;
    if (resolvedKeyRef.current === key) return;

    const controller = new AbortController();
    let active = true;
    fetch(`/api/market/history?id=${activeSymbol}&period=${activePeriod}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as MarketHistory;
      })
      .then((data) => {
        if (!active) return;
        resolvedKeyRef.current = key;
        setResult({ key, data });
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
  }, [activeSymbol, activePeriod, nonce]);

  // 选中标的、周期、筛选写回地址栏，支持刷新与分享（不产生新的历史记录）。
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeSymbol) url.searchParams.set("symbol", String(activeSymbol));
    else url.searchParams.delete("symbol");
    url.searchParams.set("period", activePeriod);
    if (filter === "all") url.searchParams.delete("market");
    else url.searchParams.set("market", filter);
    window.history.replaceState(null, "", url);
  }, [activeSymbol, activePeriod, filter]);

  const reloadOverview = useCallback(
    async (nextSelectId?: number) => {
      if (!isAdmin) return;
      const overview = await siteAdminRequest<MarketOverview>("/api/admin/market");
      setLiveOverview({
        baseItems: items,
        items: overview.items,
        totals: overview.totals,
      });
      if (nextSelectId !== undefined) {
        const nextItem = overview.items.find((entry) => entry.id === nextSelectId);
        if (nextItem) {
          setFilter("all");
          setQuery("");
        }
        setSymbolId(nextSelectId);
      }
      setConfirmRemoveId(null);
      setAdminActionError(null);
      router.refresh();
    },
    [isAdmin, items, router],
  );

  const handleSelectWatchItem = useCallback((id: number) => {
    setSymbolId(id);
    setConfirmRemoveId(null);
    setAdminActionError(null);
  }, []);

  const handleSelectFromIndex = useCallback(
    (watchItem: MarketQuoteItem) => {
      const currentlyVisible = visible.some((entry) => entry.id === watchItem.id);
      if (!currentlyVisible) {
        setFilter("all");
        setQuery("");
      }
      handleSelectWatchItem(watchItem.id);
    },
    [visible, handleSelectWatchItem],
  );

  const handleRemoveSelected = useCallback(
    async (item: MarketQuoteItem) => {
      if (!isAdmin) return;
      setRemoving(true);
      setAdminActionError(null);
      try {
        await siteAdminRequest(`/api/admin/market/${item.id}`, { method: "DELETE" });
        await reloadOverview();
      } catch (reason) {
        setAdminActionError(describeSiteAdminError(reason));
      } finally {
        setRemoving(false);
      }
    },
    [isAdmin, reloadOverview],
  );

  // 核心盘口与估值指标网格（个股/ETF/指数 vs 公募基金）
  const telemetryRows = useMemo(() => {
    if (!selected) return [];
    const cur = selected.currency;
    const kind = selected.kind;

    if (kind === "fund") {
      return [
        ["最新净值", selected.price > 0 ? money(selected.price, cur, "fund") : "—"],
        [
          "日涨跌",
          selected.price > 0
            ? `${money(selected.change, cur, "fund", true)} (${formatSignedPct(selected.change_pct)})`
            : "—",
        ],
        ["净值日期", selected.time || "—"],
        ["计价币种", cur === "USD" ? "美元 (USD)" : "人民币 (CNY)"],
      ] as Array<[string, string]>;
    }

    const prevCloseVal = selected.prev_close ?? history?.prev_close ?? null;
    return [
      ["今开", selected.open != null ? money(selected.open, cur, kind) : "—"],
      ["最高", selected.high != null ? money(selected.high, cur, kind) : "—"],
      ["最低", selected.low != null ? money(selected.low, cur, kind) : "—"],
      ["昨收", prevCloseVal != null ? money(prevCloseVal, cur, kind) : "—"],
      ["成交额", compactAmount(selected.amount)],
      [
        "换手率",
        selected.turnover_rate != null ? `${selected.turnover_rate.toFixed(2)}%` : "—",
      ],
      ["振幅", selected.amplitude != null ? `${selected.amplitude.toFixed(2)}%` : "—"],
      ["市盈率(TTM)", selected.pe != null ? selected.pe.toFixed(2) : "—"],
      ["市净率(PB)", selected.pb != null ? selected.pb.toFixed(2) : "—"],
      ["总市值", compactMarketCap(selected.market_cap)],
    ] as Array<[string, string]>;
  }, [selected, history]);

  // 周期补充统计（周K / 月K 或基金历史区间净值）
  const periodStatRows = useMemo(() => {
    if (!history || !selected) return [];
    const cur = selected.currency;
    const kind = selected.kind;

    if (
      history.series === "candle" &&
      history.candles.length > 0 &&
      (history.period === "week" || history.period === "month")
    ) {
      const last = history.candles[history.candles.length - 1];
      const labels =
        history.period === "month"
          ? (["本月开", "本月高", "本月低", "上月收", "本月量"] as const)
          : (["本周开", "本周高", "本周低", "上周收", "本周量"] as const);
      return [
        [labels[0], money(last.open, cur, kind)],
        [labels[1], money(last.high, cur, kind)],
        [labels[2], money(last.low, cur, kind)],
        [labels[3], history.prev_close === null ? "—" : money(history.prev_close, cur, kind)],
        [labels[4], compactVolume(last.volume)],
      ] as Array<[string, string]>;
    }

    if (kind === "fund" && history.points.length > 0) {
      const values = history.points.map((point) => point.value);
      const high = Math.max(...values);
      const low = Math.min(...values);
      const last = values[values.length - 1];
      const pct =
        history.prev_close && history.prev_close > 0
          ? ((last - history.prev_close) / history.prev_close) * 100
          : null;
      return [
        ["上期净值", history.prev_close === null ? "—" : money(history.prev_close, cur, kind)],
        ["区间最高", money(high, cur, kind)],
        ["区间最低", money(low, cur, kind)],
        ["较上期", pct === null ? "—" : formatSignedPct(pct)],
      ] as Array<[string, string]>;
    }

    return [];
  }, [history, selected]);

  const dayRange = useMemo(() => {
    if (!selected || selected.kind === "fund") return null;
    const low = selected.low;
    const high = selected.high;
    const price = selected.price;
    if (low == null || high == null || low <= 0 || high <= low || price <= 0) return null;

    const clampPct = (val: number) => Math.min(100, Math.max(0, ((val - low) / (high - low)) * 100));
    const pricePct = clampPct(price);
    const prevClose = selected.prev_close ?? history?.prev_close ?? null;
    const prevPct =
      prevClose != null && prevClose >= low && prevClose <= high ? clampPct(prevClose) : null;

    return { low, high, pricePct, prevClose, prevPct };
  }, [selected, history]);

  const refresh = useCallback(() => {
    setNonce((value) => value + 1);
    router.refresh();
  }, [router]);

  function handleWatchlistKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (visible.length === 0) return;
    event.preventDefault();
    const currentIndex = visible.findIndex((item) => item.id === selected?.id);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      currentIndex < 0 ? 0 : (currentIndex + delta + visible.length) % visible.length;
    const nextItem = visible[nextIndex];
    if (!nextItem) return;
    handleSelectWatchItem(nextItem.id);
    const btn = itemButtonRefs.current[nextIndex];
    btn?.focus();
    btn?.scrollIntoView({ block: "nearest" });
  }

  const indexStrip = indices.length > 0 && (
    <section aria-label="全球指数" className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterTabs
          items={INDEX_GROUPS}
          value={indexGroup}
          onChange={(next) => setIndexGroup(next)}
          variant="pill"
          aria-label="指数区域筛选"
          tabClassName="py-1"
        />
        <span className="text-[11px] text-slate-400">
          共 {visibleIndices.length} 个核心指数 · 已入自选指数支持点击切图
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {visibleIndices.map((item) => {
          const matchedWatch = watchIndexByCode.get(item.code.toUpperCase()) ?? null;
          const active = matchedWatch !== null && selected?.id === matchedWatch.id;
          const badge = indexBadgeLabel(item);
          const amountText =
            item.amount != null && item.amount > 0 ? `成交 ${compactAmount(item.amount, true)}` : null;
          const ampText =
            item.amplitude != null && item.amplitude > 0
              ? `振幅 ${item.amplitude.toFixed(2)}%`
              : null;

          const body = (
            <>
              <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex min-w-0 items-center gap-1 truncate">
                  <span className="shrink-0 rounded bg-slate-500/10 px-1 py-0.5 text-[10px]">
                    {badge}
                  </span>
                  <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                    {item.name}
                  </span>
                </span>
                {matchedWatch && (
                  <span className="shrink-0 rounded bg-sky-500/10 px-1 py-0.5 text-[10px] text-sky-600 dark:text-sky-300">
                    自选
                  </span>
                )}
              </div>

              <p className={`mt-1 text-sm font-semibold tabular-nums ${trendClass(item.change_pct)}`}>
                {item.price.toLocaleString("zh-CN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>

              <p className={`mt-0.5 text-[11px] tabular-nums ${trendClass(item.change_pct)}`}>
                <span>{formatSignedPoint(item.change)}</span>
                <span className="ml-1.5">{formatSignedPct(item.change_pct)}</span>
              </p>

              {(amountText || ampText) && (
                <p className="mt-1 flex items-center justify-between gap-1 text-[10px] text-slate-400 tabular-nums">
                  <span className="truncate">{amountText ?? ampText}</span>
                  {amountText && ampText && <span className="shrink-0">{ampText}</span>}
                </p>
              )}
            </>
          );

          const cardClass = `rounded-xl border px-3 py-2 text-left backdrop-blur-md transition ${
            active
              ? "border-sky-500/80 bg-sky-500/12 ring-1 ring-sky-500/30"
              : "border-white/40 bg-white/45 dark:border-white/10 dark:bg-slate-800/45"
          }`;

          if (matchedWatch) {
            return (
              <button
                key={`${item.market}-${item.code}`}
                type="button"
                onClick={() => handleSelectFromIndex(matchedWatch)}
                title={`点击查看 ${item.name} 详情与K线`}
                aria-current={active ? "true" : undefined}
                className={`${cardClass} cursor-pointer hover:border-sky-400/70 focus-visible:outline-2 focus-visible:outline-sky-500`}
              >
                {body}
              </button>
            );
          }

          return (
            <div key={`${item.market}-${item.code}`} className={cardClass}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );

  if (watchItems.length === 0) {
    return (
      <div className="space-y-5">
        {indexStrip}
        <div className="rounded-2xl border border-white/40 bg-white/45 p-8 text-center text-sm text-slate-500 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45 dark:text-slate-400">
          <p>还没有自选标的。</p>
          {isAdmin ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                <Plus className="h-3.5 w-3.5" />
                搜索添加股票 / 基金 / 指数
              </button>
              <Link
                href="/admin/market"
                className="text-xs text-sky-700 underline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300"
              >
                去后台管理
              </Link>
            </div>
          ) : (
            <p className="mt-1">管理员在后台「行情」里添加后即可查看。</p>
          )}
        </div>
        {isAdmin && addModalOpen && (
          <MarketAddModal
            watchItems={watchItems}
            onClose={() => setAddModalOpen(false)}
            onAdded={reloadOverview}
            onSelectExisting={handleSelectWatchItem}
          />
        )}
      </div>
    );
  }

  const currency = selected?.currency ?? "CNY";

  return (
    <div className="space-y-5">
      {indexStrip}

      <div className="flex flex-wrap items-center gap-2">
        <FilterTabs
          items={FILTERS}
          value={filter}
          onChange={(next) => setFilter(next)}
          variant="segmented"
          aria-label="市场筛选"
        />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称或代码"
              aria-label="搜索自选标的"
              className="h-8 w-40 rounded-full border border-white/40 bg-white/60 pl-7 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 sm:w-44"
            />
            {query && (
              <button
                type="button"
                aria-label="清除搜索"
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

          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            aria-label="自选排序"
            className="h-8 rounded-full border border-white/40 bg-white/60 px-3 text-xs text-slate-700 focus:border-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200"
          >
            <option value="default">默认排序</option>
            <option value="up">涨幅居前</option>
            <option value="down">跌幅居前</option>
            {isAdmin && <option value="value">持仓市值</option>}
            {isAdmin && <option value="profit">浮动盈亏</option>}
          </select>

          <button
            type="button"
            onClick={refresh}
            className="flex h-8 items-center gap-1 rounded-full border border-white/40 px-3 text-xs text-slate-600 hover:border-sky-300 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:text-slate-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="flex h-8 items-center gap-1 rounded-full bg-sky-600 px-3.5 text-xs font-medium text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <Plus className="h-3.5 w-3.5" />
              搜索添加股票 / 基金 / 指数
            </button>
          )}
        </div>
      </div>

      {/* 移动端顶部自选速切横条：无需翻越图表即可一键切股 */}
      {visible.length > 0 && (
        <div
          aria-label="移动端自选速切"
          className="flex gap-2 overflow-x-auto pb-1 lg:hidden"
        >
          {visible.map((item) => {
            const active = selected?.id === item.id;
            return (
              <button
                key={`mobile-${item.id}`}
                type="button"
                onClick={() => handleSelectWatchItem(item.id)}
                aria-current={active}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  active
                    ? "border-sky-500 bg-sky-500/15 font-medium text-sky-700 dark:text-sky-300"
                    : "border-white/40 bg-white/50 text-slate-700 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200"
                }`}
              >
                <span className="max-w-[96px] truncate">{item.name}</span>
                <span className={`tabular-nums text-[11px] ${trendClass(item.price > 0 ? item.change_pct : 0, true)}`}>
                  {item.price > 0 ? formatSignedPct(item.change_pct) : "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <section aria-label="自选列表" className="order-2 lg:order-1">
          {visible.length > 0 && (
            <div className="mb-2.5 space-y-2">
              <div className="rounded-xl border border-white/40 bg-white/45 px-3 py-2 text-[11px] backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
                <div className="flex items-center justify-between gap-2 tabular-nums">
                  <span className="flex items-center gap-2">
                    <span className="text-rose-500">上涨 {breadth.up}</span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="text-emerald-600">下跌 {breadth.down}</span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="text-slate-500 dark:text-slate-400">平盘 {breadth.flat}</span>
                  </span>
                  <span className="text-slate-400">↑↓ 键切换</span>
                </div>
                <div
                  className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-500/15"
                  aria-hidden="true"
                >
                  {breadth.upPct > 0 && (
                    <div className="h-full bg-rose-500" style={{ width: `${breadth.upPct}%` }} />
                  )}
                  {breadth.flatPct > 0 && (
                    <div className="h-full bg-slate-400/50" style={{ width: `${breadth.flatPct}%` }} />
                  )}
                  {breadth.downPct > 0 && (
                    <div className="h-full bg-emerald-500" style={{ width: `${breadth.downPct}%` }} />
                  )}
                </div>
              </div>

              {(movers.topGainer || movers.topLoser) && (
                <div className="flex flex-wrap gap-1.5" aria-label="今日领涨与领跌">
                  {movers.topGainer && (
                    <button
                      type="button"
                      onClick={() => handleSelectWatchItem(movers.topGainer!.id)}
                      className={`inline-flex min-w-0 flex-1 items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                        selected?.id === movers.topGainer.id
                          ? "border-rose-400 bg-rose-500/15 ring-1 ring-rose-400/30"
                          : "border-rose-300/40 bg-rose-500/8 hover:border-rose-400/70"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1 truncate text-slate-700 dark:text-slate-200">
                        <span className="shrink-0 font-medium text-rose-500">领涨</span>
                        <span className="truncate">{movers.topGainer.name}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-rose-500">
                        {formatSignedPct(movers.topGainer.change_pct)}
                      </span>
                    </button>
                  )}

                  {movers.topLoser && (
                    <button
                      type="button"
                      onClick={() => handleSelectWatchItem(movers.topLoser!.id)}
                      className={`inline-flex min-w-0 flex-1 items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                        selected?.id === movers.topLoser.id
                          ? "border-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-400/30"
                          : "border-emerald-300/40 bg-emerald-500/8 hover:border-emerald-400/70"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1 truncate text-slate-700 dark:text-slate-200">
                        <span className="shrink-0 font-medium text-emerald-600">领跌</span>
                        <span className="truncate">{movers.topLoser.name}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-emerald-600">
                        {formatSignedPct(movers.topLoser.change_pct)}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/40 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
              没有匹配的标的。
            </p>
          ) : (
            <ul
              onKeyDown={handleWatchlistKeyDown}
              className="max-h-[560px] space-y-2 overflow-y-auto pr-1"
            >
              {visible.map((item, index) => {
                const active = selected?.id === item.id;
                const up = item.change_pct >= 0;
                const flat = item.price <= 0 || item.change_pct === 0;
                return (
                  <li key={item.id}>
                    <button
                      ref={(node) => {
                        itemButtonRefs.current[index] = node;
                      }}
                      type="button"
                      onClick={() => handleSelectWatchItem(item.id)}
                      aria-current={active}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                        active
                          ? "border-sky-400/70 bg-sky-500/10"
                          : "border-white/40 bg-white/45 hover:border-sky-300/60 dark:border-white/10 dark:bg-slate-800/45"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                            {item.name}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                            <span>{item.code}</span>
                            <span className="rounded bg-slate-500/10 px-1">{MARKET_LABEL[item.market]}</span>
                            <span>{KIND_LABEL[item.kind]}</span>
                            {item.stale && <span className="text-amber-500">缓存</span>}
                          </p>
                        </div>
                        <span
                          className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                            flat
                              ? "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                              : up
                                ? "bg-rose-500/10 text-rose-500"
                                : "bg-emerald-500/10 text-emerald-600"
                          }`}
                        >
                          {!flat && (up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
                          {item.price > 0 ? formatSignedPct(item.change_pct) : "—"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className={`text-lg font-semibold tabular-nums ${trendClass(item.price > 0 ? item.change_pct : 0)}`}>
                          {item.price > 0 ? money(item.price, item.currency, item.kind) : "—"}
                        </span>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {item.market_value !== null
                            ? `市值 ${money(item.market_value, item.currency, item.kind)}`
                            : item.time}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {currencyTotals.length > 0 && (
            <div className="mt-3 space-y-2">
              {currencyTotals.map((total) => (
                <div
                  key={total.currency}
                  className="rounded-xl border border-white/40 bg-white/45 p-3 text-xs backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
                >
                  <p className="font-medium text-slate-600 dark:text-slate-300">
                    {total.currency === "USD" ? "美元持仓" : "人民币持仓"}
                  </p>
                  <dl className="mt-1.5 grid grid-cols-3 gap-2">
                    <div>
                      <dt className="text-slate-400">市值</dt>
                      <dd className="tabular-nums text-slate-700 dark:text-slate-200">
                        {total.value === null ? "行情不足" : money(total.value, total.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">成本</dt>
                      <dd className="tabular-nums text-slate-700 dark:text-slate-200">
                        {money(total.cost, total.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">盈亏</dt>
                      <dd className={`tabular-nums ${trendClass(total.profit ?? 0)}`}>
                        {total.profit === null ? "—" : money(total.profit, total.currency, "stock", true)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-label="行情详情" className="order-1 lg:order-2">
          {!selected ? (
            <p className="rounded-xl border border-dashed border-white/40 px-4 py-16 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
              选择一个标的查看详情。
            </p>
          ) : (
            <div className="rounded-2xl border border-white/40 bg-white/55 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/55 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-800 dark:text-white">
                    {selected.name}
                    <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-normal text-slate-500 dark:text-slate-400">
                      {MARKET_LABEL[selected.market]} · {KIND_LABEL[selected.kind]}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {selected.code}
                    {selected.time ? ` · 更新 ${selected.time}` : ""}
                    {selected.stale ? " · 缓存报价" : ""}
                  </p>
                </div>

                <div className="text-right">
                  <p className={`text-2xl font-semibold tabular-nums ${trendClass(selected.price > 0 ? selected.change_pct : 0)}`}>
                    {selected.price > 0 ? money(selected.price, currency, selected.kind) : "—"}
                    {selected.kind === "index" && selected.price > 0 ? (
                      <span className="ml-1 text-xs font-normal text-slate-400">点</span>
                    ) : null}
                  </p>
                  <p className={`text-xs tabular-nums ${trendClass(selected.price > 0 ? selected.change_pct : 0)}`}>
                    {selected.price > 0
                      ? `${money(selected.change, currency, selected.kind, true)} · ${formatSignedPct(selected.change_pct)}`
                      : "暂无报价"}
                  </p>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-white/30 pt-2.5 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setHoldingModalOpen(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/60 px-2.5 py-1 text-[11px] text-slate-700 transition hover:border-sky-400 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:text-sky-300"
                  >
                    <Briefcase className="h-3 w-3" />
                    设置持仓
                  </button>

                  <button
                    type="button"
                    onClick={() => setAlertModalOpen(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/60 px-2.5 py-1 text-[11px] text-slate-700 transition hover:border-sky-400 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:text-sky-300"
                  >
                    <Bell className="h-3 w-3" />
                    涨跌提醒
                  </button>

                  {confirmRemoveId === selected.id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => void handleRemoveSelected(selected)}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-rose-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-500"
                      >
                        <Trash2 className="h-3 w-3" />
                        {removing ? "移出中…" : "确认移出"}
                      </button>
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => setConfirmRemoveId(null)}
                        className="rounded-full border border-white/50 px-2.5 py-1 text-[11px] text-slate-500 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:text-slate-300"
                      >
                        取消
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveId(selected.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-white/50 bg-white/60 px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-rose-400 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" />
                      移出自选
                    </button>
                  )}

                  {adminActionError && (
                    <span className="text-[11px] text-rose-500">{adminActionError}</span>
                  )}
                </div>
              )}

              {/* 日内高低区间条 */}
              {dayRange && (
                <div className="mt-3 rounded-xl bg-slate-500/5 px-3 py-2 text-[11px]">
                  <div className="flex items-center justify-between text-slate-500 tabular-nums dark:text-slate-400">
                    <span>最低 {money(dayRange.low, currency, selected.kind)}</span>
                    <span className="text-slate-400">
                      日内区间 · {dayRange.pricePct.toFixed(0)}%
                    </span>
                    <span>最高 {money(dayRange.high, currency, selected.kind)}</span>
                  </div>
                  <div className="relative mt-1.5 h-1.5 w-full rounded-full bg-slate-500/15">
                    <div
                      className={`h-full rounded-full ${
                        selected.change_pct > 0
                          ? "bg-rose-500/45"
                          : selected.change_pct < 0
                            ? "bg-emerald-500/45"
                            : "bg-sky-500/45"
                      }`}
                      style={{ width: `${dayRange.pricePct}%` }}
                    />
                    {dayRange.prevPct !== null && (
                      <span
                        title={`昨收 ${money(dayRange.prevClose!, currency, selected.kind)}`}
                        className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-500/75 dark:bg-slate-300/75"
                        style={{ left: `${dayRange.prevPct}%` }}
                      />
                    )}
                    <span
                      title={`现价 ${money(selected.price, currency, selected.kind)}`}
                      className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                        selected.change_pct > 0
                          ? "bg-rose-500"
                          : selected.change_pct < 0
                            ? "bg-emerald-500"
                            : "bg-sky-500"
                      }`}
                      style={{ left: `${dayRange.pricePct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 核心盘口与估值指标网格 */}
              {telemetryRows.length > 0 && (
                <dl
                  className={`mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-500/5 px-3 py-2.5 text-xs ${
                    selected.kind === "fund" ? "sm:grid-cols-4" : "sm:grid-cols-5"
                  }`}
                >
                  {telemetryRows.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[11px] text-slate-400">{label}</dt>
                      <dd className="mt-0.5 truncate font-medium tabular-nums text-slate-700 dark:text-slate-200">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {periodStatRows.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-white/30 bg-white/30 px-3 py-2 text-xs dark:border-white/5 dark:bg-slate-800/30 sm:grid-cols-5">
                  {periodStatRows.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[11px] text-slate-400">{label}</dt>
                      <dd className="mt-0.5 truncate tabular-nums text-slate-700 dark:text-slate-200">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {isAdmin && selected.cost !== null && selected.shares !== null && selected.shares > 0 && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  持仓 {selected.shares} 份 · 成本 {money(selected.cost, currency, selected.kind)} · 市值{" "}
                  {selected.market_value === null
                    ? "—"
                    : money(selected.market_value, currency, selected.kind)}{" "}
                  · 盈亏{" "}
                  <span className={trendClass(selected.profit ?? 0)}>
                    {selected.profit === null
                      ? "—"
                      : money(selected.profit, currency, selected.kind, true)}
                    {selected.profit_pct !== null
                      ? `（${formatSignedPct(selected.profit_pct)}）`
                      : ""}
                  </span>
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-1 border-b border-white/30 pb-2 dark:border-white/10">
                <FilterTabs
                  items={PERIODS.map((entry) => {
                    const disabled = selected.kind === "fund" && entry.key === "intraday";
                    return {
                      key: entry.key,
                      label: entry.label,
                      title: disabled ? "基金按日披露净值，没有分时" : entry.hint,
                      disabled,
                    };
                  })}
                  value={activePeriod}
                  onChange={(next) => setPeriod(next)}
                  variant="underline"
                  aria-label="时间周期"
                  className="border-b-0 pb-0"
                />
                {history && (
                  <span className="ml-auto self-center text-[11px] text-slate-400">
                    来源：
                    {history.source === "eastmoney"
                      ? "东方财富"
                      : history.source === "fund"
                        ? "基金净值"
                        : "站内快照"}
                    {history.stale ? "（缓存）" : ""}
                  </span>
                )}
              </div>

              <div className="mt-2 min-h-[336px]">
                {loading && (
                  <div className="flex h-[336px] animate-pulse items-center justify-center rounded-xl bg-slate-500/5 text-xs text-slate-400">
                    加载行情…
                  </div>
                )}
                {!loading && error && (
                  <div className="flex h-[336px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-rose-300/50 text-sm text-rose-500">
                    <AlertTriangle className="h-5 w-5" />
                    {error}
                    <button
                      type="button"
                      onClick={() => setNonce((value) => value + 1)}
                      className="rounded-full border border-rose-300/60 px-3 py-1 text-xs focus-visible:outline-2 focus-visible:outline-sky-500"
                    >
                      重试
                    </button>
                  </div>
                )}
                {!loading && !error && history && (
                  <MarketChart data={history} currency={currency} kind={selected.kind} />
                )}
              </div>

              {history && (
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  {history.note}
                  {history.updated_at ? ` · 抓取于北京时间 ${formatClock(history.updated_at)}` : ""}
                </p>
              )}

              {history && <HistoryTable data={history} currency={currency} kind={selected.kind} />}
            </div>
          )}
        </section>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <TrendingUp className="h-3.5 w-3.5" />
        报价来自腾讯（A股个股/基金）与东方财富（指数/美股），K 线与分时来自东方财富公开接口；数据仅供参考，不构成投资建议。
      </p>

      {isAdmin && addModalOpen && (
        <MarketAddModal
          watchItems={watchItems}
          onClose={() => setAddModalOpen(false)}
          onAdded={reloadOverview}
          onSelectExisting={handleSelectWatchItem}
        />
      )}

      {isAdmin && holdingModalOpen && selected && (
        <MarketHoldingModal
          key={selected.id}
          item={selected}
          onClose={() => setHoldingModalOpen(false)}
          onSaved={() => reloadOverview(selected.id)}
        />
      )}

      {isAdmin && alertModalOpen && selected && (
        <MarketAlertModal
          key={selected.id}
          item={selected}
          onClose={() => setAlertModalOpen(false)}
        />
      )}
    </div>
  );
}

function HistoryTable({
  data,
  currency,
  kind,
}: {
  data: MarketHistory;
  currency: "CNY" | "USD";
  kind: MarketQuoteItem["kind"];
}) {
  const rows =
    data.series === "candle"
      ? data.candles.slice(-30).reverse().map((candle) => [
          candle.date,
          money(candle.open, currency, kind),
          money(candle.high, currency, kind),
          money(candle.low, currency, kind),
          money(candle.close, currency, kind),
          compactVolume(candle.volume),
        ])
      : data.points.slice(-30).reverse().map((point) => [
          point.label,
          money(point.value, currency, kind),
          point.avg !== undefined ? money(point.avg, currency, kind) : "—",
          point.volume ? compactVolume(point.volume) : "—",
          "",
          "",
        ]);

  if (rows.length === 0) return null;

  return (
    <details className="mt-3 text-xs text-slate-600 dark:text-slate-300">
      <summary className="cursor-pointer text-slate-500 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-400">
        查看最近 30 条原始数据
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left">
          <thead>
            <tr className="text-slate-400">
              <th scope="col" className="py-1 font-normal">{data.series === "candle" ? "日期" : "时间"}</th>
              {data.series === "candle" ? (
                <>
                  <th scope="col" className="py-1 text-right font-normal">开</th>
                  <th scope="col" className="py-1 text-right font-normal">高</th>
                  <th scope="col" className="py-1 text-right font-normal">低</th>
                  <th scope="col" className="py-1 text-right font-normal">收</th>
                  <th scope="col" className="py-1 text-right font-normal">量</th>
                </>
              ) : (
                <>
                  <th scope="col" className="py-1 text-right font-normal">价格</th>
                  <th scope="col" className="py-1 text-right font-normal">均价</th>
                  <th scope="col" className="py-1 text-right font-normal">量</th>
                  <th scope="col" className="py-1" />
                  <th scope="col" className="py-1" />
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-500/15">
            {rows.map((row, index) => (
              <tr key={`${row[0]}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${row[0]}-${cellIndex}`}
                    className={`py-1 ${cellIndex === 0 ? "" : "text-right tabular-nums"}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
