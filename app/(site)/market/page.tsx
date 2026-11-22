import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { getAdminSession } from "@/server/auth/guard";
import { getMarketService } from "@/server/modules/market";
import { loadSiteSettings } from "@/server/modules/site-settings";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return {
    title: `行情 · ${profile.siteTitle}`,
    description: "自选基金、股票与指数的实时报价",
  };
}

const money = (value: number) =>
  value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function MarketPage() {
  const service = getMarketService();
  const [quotes, admin] = await Promise.all([
    service.quotes().catch(() => []),
    getAdminSession(),
  ]);
  const overview = admin ? await service.overview().catch(() => null) : null;

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

      {overview && overview.items.some((item) => item.market_value !== null) && (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          {[
            { label: "持仓市值", value: overview.total_value, tone: "text-slate-800 dark:text-white" },
            { label: "持仓成本", value: overview.total_cost, tone: "text-slate-500" },
            {
              label: "浮动盈亏",
              value: overview.total_profit,
              tone: overview.total_profit >= 0 ? "text-rose-500" : "text-emerald-500",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
              <p className={`mt-1 text-xl font-semibold ${card.tone}`}>¥ {money(card.value)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quotes.map((item) => {
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
                  {up ? "+" : ""}
                  {item.change_pct.toFixed(2)}%
                </span>
              </div>
              <p className={`mt-3 text-2xl font-semibold ${up ? "text-rose-500" : "text-emerald-600"}`}>
                {item.price > 0 ? money(item.price) : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {item.price > 0
                  ? `${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)} · ${item.time}`
                  : "暂无数据"}
                {item.stale ? " · 缓存" : ""}
              </p>
            </div>
          );
        })}
      </div>

      {quotes.length === 0 && (
        <p className="rounded-2xl border border-white/40 bg-white/40 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
          还没有自选标的，登录后台「行情」添加。
        </p>
      )}
    </div>
  );
}
