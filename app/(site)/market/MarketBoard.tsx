"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, RefreshCw, Search, TrendingUp } from "lucide-react";
import FilterTabs from "@/components/site/FilterTabs";
import { formatClock, formatMoney } from "@/lib/format";
import type {
  MarketCurrencyTotals,
  MarketHistory,
  MarketIndexItem,
  MarketPeriod,
  MarketQuoteItem,
} from "@/server/modules/market/contracts";
import MarketChart from "./MarketChart";

type Filter = "all" | "cn" | "us" | "fund";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "cn", label: "A股" },
  { key: "us", label: "美股" },
  { key: "fund", label: "基金" },
];

const PERIODS: Array<{ key: MarketPeriod; label: string; hint: string }> = [
  { key: "intraday", label: "分时", hint: "当日一分钟走势" },
  { key: "day", label: "日K", hint: "前复权日线" },
  { key: "week", label: "周K", hint: "日线按自然周聚合" },
  { key: "month", label: "月K", hint: "日线按自然月聚合" },
];

const MARKET_LABEL: Record<string, string> = { cn: "A股", us: "美股" };
const KIND_LABEL: Record<string, string> = { stock: "股票", index: "指数", fund: "基金" };

// 指数点位以「点」计价，不是货币，所以不加 ¥/$；基金固定 4 位。
// 委托给共享 formatMoney，保证前后台同一标的的精度与符号口径一致。
const money = (
  value: number,
  currency: "CNY" | "USD",
  kind: MarketQuoteItem["kind"] = "stock",
  sign = false,
) => formatMoney(value, { currency, kind, sign });

const compactVolume = (value: number) => {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(2)} 万`;
  return value.toLocaleString("zh-CN");
};

function trendClass(value: number, flat = false): string {
  if (value > 0) return "text-rose-500";
  if (value < 0) return "text-emerald-600";
  return flat ? "text-slate-400" : "text-slate-600 dark:text-slate-300";
}

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
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");
  const [symbolId, setSymbolId] = useState<number | null>(
    initialSymbol ?? items[0]?.id ?? null,
  );
  const [period, setPeriod] = useState<MarketPeriod>(initialPeriod);

  // 首屏历史由服务端随页面带下来，键必须与客户端派生的请求键完全一致，
  // 否则会再请求一次，或把上一只标的的数据错配到当前标的。
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

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return items.filter((item) => {
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
  }, [items, filter, query]);

  // 筛选/搜索无匹配时不要回退到列表第一只，否则详情与 URL 都会指向看不到的标的。
  const selected = useMemo(
    () => visible.find((item) => item.id === symbolId) ?? null,
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
    // 只在收到响应后标记已解析：StrictMode 二次挂载会 abort 首次请求，
    // 发请求前就置位会让第二次挂载早退，界面永久停在加载态。
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

  // 指标行随周期/品种变化：K 线用 OHLC，分时用当日开高低，基金用净值口径。
  const statRows = useMemo(() => {
    if (!history || !selected) return [];
    const cur = selected.currency;
    const kind = selected.kind;

    if (history.series === "candle" && history.candles.length > 0) {
      const last = history.candles[history.candles.length - 1];
      // 周/月线的「上期末收」不是昨收，标签要跟周期走，否则口径是错的。
      const labels =
        history.period === "month"
          ? (["本月开", "本月高", "本月低", "上月收", "本月量"] as const)
          : history.period === "week"
            ? (["本周开", "本周高", "本周低", "上周收", "本周量"] as const)
            : (["今开", "最高", "最低", "昨收", "成交量"] as const);
      return [
        [labels[0], money(last.open, cur, kind)],
        [labels[1], money(last.high, cur, kind)],
        [labels[2], money(last.low, cur, kind)],
        [labels[3], history.prev_close === null ? "—" : money(history.prev_close, cur, kind)],
        [labels[4], compactVolume(last.volume)],
      ];
    }

    if (history.points.length > 0) {
      const values = history.points.map((point) => point.value);
      const last = values[values.length - 1];
      const high = Math.max(...values);
      const low = Math.min(...values);

      if (history.period === "intraday") {
        const volume = history.points.reduce((sum, point) => sum + (point.volume ?? 0), 0);
        return [
          ["今开", money(values[0], cur, kind)],
          ["最高", money(high, cur, kind)],
          ["最低", money(low, cur, kind)],
          ["昨收", history.prev_close === null ? "—" : money(history.prev_close, cur, kind)],
          ["成交量", volume > 0 ? compactVolume(volume) : "—"],
        ];
      }

      const pct =
        history.prev_close && history.prev_close > 0
          ? ((last - history.prev_close) / history.prev_close) * 100
          : null;
      return [
        ["最新净值", money(last, cur, kind)],
        ["上期净值", history.prev_close === null ? "—" : money(history.prev_close, cur, kind)],
        ["区间最高", money(high, cur, kind)],
        ["区间最低", money(low, cur, kind)],
        ["涨跌", pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`],
      ];
    }

    return [];
  }, [history, selected]);

  const refresh = useCallback(() => {
    setNonce((value) => value + 1);
    router.refresh();
  }, [router]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/40 bg-white/40 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
        还没有自选标的。
        {isAdmin ? (
          <Link href="/admin/market" className="ml-1 text-sky-700 underline dark:text-sky-300">
            去后台添加
          </Link>
        ) : (
          "管理员在后台「行情」里添加后即可查看。"
        )}
      </div>
    );
  }

  const currency = selected?.currency ?? "CNY";

  return (
    <div className="space-y-5">
      {indices.length > 0 && (
        <section aria-label="全球指数" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {indices.map((item) => (
            <div
              key={`${item.market}-${item.code}`}
              className="rounded-xl border border-white/40 bg-white/45 px-3 py-2 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
            >
              <p className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="rounded bg-slate-500/10 px-1 py-0.5 text-[10px]">{MARKET_LABEL[item.market]}</span>
                {item.name}
              </p>
              <p className={`mt-1 text-sm font-semibold tabular-nums ${trendClass(item.change_pct)}`}>
                {item.price.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="ml-1.5 text-[11px]">
                  {item.change_pct >= 0 ? "+" : ""}
                  {item.change_pct.toFixed(2)}%
                </span>
              </p>
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FilterTabs
          items={FILTERS}
          value={filter}
          onChange={(next) => setFilter(next)}
          variant="segmented"
          aria-label="市场筛选"
        />

        <label className="relative ml-auto flex items-center">
          <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称或代码"
            aria-label="搜索自选标的"
            className="h-8 w-40 rounded-full border border-white/40 bg-white/60 pl-7 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 sm:w-48"
          />
        </label>

        <button
          type="button"
          onClick={refresh}
          className="flex h-8 items-center gap-1 rounded-full border border-white/40 px-3 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <section aria-label="自选列表" className="order-2 lg:order-1">
          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/40 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
              没有匹配的标的。
            </p>
          ) : (
            <ul className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {visible.map((item) => {
                const active = selected?.id === item.id;
                const up = item.change_pct >= 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSymbolId(item.id)}
                      aria-current={active}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
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
                          className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                            up ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-600"
                          }`}
                        >
                          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {item.price > 0 ? `${up ? "+" : ""}${item.change_pct.toFixed(2)}%` : "—"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className={`text-lg font-semibold tabular-nums ${trendClass(item.change_pct)}`}>
                          {item.price > 0 ? money(item.price, item.currency, item.kind) : "—"}
                        </span>
                        <span className="text-[11px] text-slate-400">
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

          {totals.length > 0 && (
            <div className="mt-3 space-y-2">
              {totals.map((total) => (
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
                        {total.profit === null ? "—" : money(total.profit, total.currency)}
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
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-white">
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
                  <p className={`text-2xl font-semibold tabular-nums ${trendClass(selected.change_pct)}`}>
                    {selected.price > 0 ? money(selected.price, currency, selected.kind) : "—"}
                    {selected.kind === "index" && selected.price > 0 ? (
                      <span className="ml-1 text-xs font-normal text-slate-400">点</span>
                    ) : null}
                  </p>
                  <p className={`text-xs tabular-nums ${trendClass(selected.change_pct)}`}>
                    {selected.price > 0
                      ? `${money(selected.change, currency, selected.kind, true)} · ${
                          selected.change_pct >= 0 ? "+" : ""
                        }${selected.change_pct.toFixed(2)}%`
                      : "暂无报价"}
                  </p>
                </div>
              </div>

              {statRows.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-500/5 px-3 py-2 text-xs sm:grid-cols-5">
                  {statRows.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-slate-400">{label}</dt>
                      <dd className="mt-0.5 truncate tabular-nums text-slate-700 dark:text-slate-200">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {isAdmin && selected.cost !== null && selected.shares !== null && selected.shares > 0 && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  持仓 {selected.shares} 份 · 成本 {money(selected.cost, currency, selected.kind)} · 市值{" "}
                  {selected.market_value === null
                    ? "—"
                    : money(selected.market_value, currency, selected.kind)} · 盈亏{" "}
                  <span className={trendClass(selected.profit ?? 0)}>
                    {selected.profit === null
                      ? "—"
                      : money(selected.profit, currency, selected.kind)}
                    {selected.profit_pct !== null ? `（${selected.profit_pct.toFixed(2)}%）` : ""}
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
                      className="rounded-full border border-rose-300/60 px-3 py-1 text-xs"
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
      <summary className="cursor-pointer text-slate-500 dark:text-slate-400">查看最近 30 条原始数据</summary>
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
