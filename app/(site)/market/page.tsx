import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { getAdminSession } from "@/server/auth/guard";
import { getMarketService } from "@/server/modules/market";
import { loadSiteSettings } from "@/server/modules/site-settings";
import MarketHistory from "./MarketHistory";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return {
    title: `行情 · ${profile.siteTitle}`,
    description: "自选基金、股票与指数的实时报价",
  };
}

const money = (value: number) =>
  value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function MarketPage({ searchParams }: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const service = getMarketService();
  const [{ symbol }, admin] = await Promise.all([
    searchParams,
    getAdminSession(),
  ]);
  const overview = admin ? await service.overview().catch(() => null) : null;
  const quotes = overview?.items ?? await service.quotes({ record: true }).catch(() => null);
  const selected = quotes?.find((item) => item.id === Number(symbol));
  const history = selected ? await service.history(selected.id).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white">
            <TrendingUp className="h-6 w-6 text-sky-500" />
            行情
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            数据来自公开接口，延迟约 1 分钟，仅供参考，不构成投资建议。
          </p>
        </div>
        {admin && (
          <Link
            href="/admin/market"
            className="rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
          >
            管理自选
          </Link>
        )}
      </div>

      {overview && overview.items.some((item) => item.cost !== null && (item.shares ?? 0) > 0) && (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          {[
            { label: "持仓市值", value: overview.total_value, tone: "text-slate-800 dark:text-white" },
            { label: "持仓成本", value: overview.total_cost, tone: "text-slate-500" },
            {
              label: "浮动盈亏",
              value: overview.total_profit,
              tone: (overview.total_profit ?? 0) >= 0 ? "text-rose-500" : "text-emerald-500",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
              <p className={`mt-1 text-xl font-semibold ${card.tone}`}>{card.value === null ? "行情不足" : `¥ ${money(card.value)}`}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quotes?.map((item) => {
          const up = item.change_pct >= 0;
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.name}</p>
                  <p className="text-xs text-slate-400">
                    {item.code} · {item.kind === "fund" ? "基金" : item.kind === "index" ? "指数" : "股票"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    up ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-600"
                  }`}
                >
                  {item.price > 0 ? `${up ? "+" : ""}${item.change_pct.toFixed(2)}%` : "暂无报价"}
                </span>
              </div>
              <p className={`mt-3 text-2xl font-semibold ${up ? "text-rose-500" : "text-emerald-600"}`}>
                {item.price > 0 ? money(item.price) : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {item.price > 0
                  ? `${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)} · ${item.time}`
                  : "暂无数据"}
                {item.stale && item.price > 0 ? " · 缓存报价" : ""}
              </p>
              <Link
                href={`/market?symbol=${item.id}#market-history`}
                aria-label={`查看${item.name}的历史报价`}
                className="mt-3 inline-flex min-h-8 items-center rounded-md text-xs font-medium text-sky-800 underline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300"
              >
                历史报价
              </Link>
            </div>
          );
        })}
      </div>

      {quotes?.length === 0 && (
        <p className="rounded-2xl border border-white/40 bg-white/40 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
          还没有自选标的，登录后台「行情」添加。
        </p>
      )}
      {quotes === null && <p role="alert" className="rounded-2xl bg-amber-100 p-5 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">行情暂时无法加载，请刷新重试。</p>}
      {selected && (
        <section id="market-history" aria-labelledby="market-history-title" className="mt-6 scroll-mt-24 rounded-2xl border border-white/40 bg-white/80 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80 sm:p-6">
          <h2 id="market-history-title" className="text-base font-semibold text-slate-800 dark:text-slate-100">{selected.name} · 历史报价</h2>
          <p className="mb-4 mt-1 text-sm text-slate-600 dark:text-slate-300">站点访问时保存的最近 120 个报价快照。</p>
          {history === null ? <p role="alert" className="text-sm">快照暂时无法加载，请刷新重试。</p>
            : history.length < 2 ? <p className="text-sm text-slate-600 dark:text-slate-300">
              {history.length === 1 ? `当前有 1 个快照，报价 ${money(history[0].price)}。` : "暂无报价快照。"}
            </p> : <MarketHistory points={history} />}
        </section>
      )}
    </div>
  );
}
