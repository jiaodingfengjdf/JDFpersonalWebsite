import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { getAdminSession } from "@/server/auth/guard";
import { getMarketService } from "@/server/modules/market";
import { marketPeriod } from "@/server/modules/market/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import MarketBoard from "./MarketBoard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return {
    title: `行情 · ${profile.siteTitle}`,
    description: "A 股、基金与美股的实时报价、分时与 K 线",
  };
}

type Filter = "all" | "cn" | "us" | "fund";
const FILTERS: Filter[] = ["all", "cn", "us", "fund"];

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; period?: string; market?: string }>;
}) {
  const [params, admin] = await Promise.all([searchParams, getAdminSession()]);
  const service = getMarketService();

  const [overview, indices] = await Promise.all([
    service.overview().catch(() => null),
    service.indices().catch(() => []),
  ]);

  // 非管理员不把成本、份额、盈亏送到浏览器。
  const items = (overview?.items ?? []).map((item) =>
    admin
      ? item
      : {
          ...item,
          cost: null,
          shares: null,
          market_value: null,
          profit: null,
          profit_pct: null,
        },
  );

  const requestedSymbol = Number(params.symbol);
  const initialSymbol =
    items.find((item) => item.id === requestedSymbol)?.id ?? items[0]?.id ?? null;
  const parsedPeriod = marketPeriod.safeParse(params.period ?? "day");
  const filter = FILTERS.includes((params.market ?? "") as Filter)
    ? ((params.market ?? "all") as Filter)
    : "all";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white">
            <TrendingUp className="h-6 w-6 text-sky-500" />
            行情
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            A 股、基金、美股与全球指数 · 分时 / 日 / 周 / 月
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

      <MarketBoard
        items={items}
        totals={admin ? (overview?.totals ?? []) : []}
        indices={indices.filter((item) => item.price > 0)}
        initialSymbol={initialSymbol}
        initialPeriod={parsedPeriod.success ? parsedPeriod.data : "day"}
        initialFilter={filter}
        isAdmin={Boolean(admin)}
      />
    </div>
  );
}
