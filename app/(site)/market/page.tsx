import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { getAdminSession } from "@/server/auth/guard";
import { getMarketService } from "@/server/modules/market";
import { marketPeriod } from "@/server/modules/market/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import MarketBoard from "./MarketBoard";

export const dynamic = "force-dynamic";

function requireModule(href: string): InterestModule {
  const found = interestModuleByHref(href);
  if (!found) throw new Error(`Missing interest module: ${href}`);
  return found;
}

const MODULE = requireModule("/market");

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildInterestMetadata({
    title: `${MODULE.pageTitle} · ${profile.siteTitle}`,
    description: MODULE.description,
    path: MODULE.href,
    indexable: MODULE.indexable,
  });
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
  const period = parsedPeriod.success ? parsedPeriod.data : "day";
  const filter = FILTERS.includes((params.market ?? "") as Filter)
    ? ((params.market ?? "all") as Filter)
    : "all";

  // 首屏默认标的与周期的历史在服务端取一次，随页面传给 MarketBoard，
  // 客户端只在请求键变化时再请求；基金无分时，按与客户端一致的口径改成日线。
  const initialItem = items.find((item) => item.id === initialSymbol);
  const effectivePeriod =
    initialItem?.kind === "fund" && period === "intraday" ? "day" : period;
  const initialHistory =
    initialSymbol !== null
      ? await service.history(initialSymbol, effectivePeriod).catch(() => null)
      : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white md:text-3xl">
            <TrendingUp className="h-6 w-6 text-sky-500" />
            行情
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            A 股、基金、美股与全球指数 · 分时 / 日K / 周K / 月K
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
        initialPeriod={period}
        initialFilter={filter}
        initialHistory={initialHistory}
        isAdmin={Boolean(admin)}
      />
    </div>
  );
}
