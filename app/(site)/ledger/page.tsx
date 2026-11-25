import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import AsyncState from "@/components/site/AsyncState";
import { formatMoney, formatMonthDay } from "@/lib/format";
import { interestModuleByHref, type InterestModule } from "@/lib/interest-modules";
import { buildInterestMetadata } from "@/lib/page-metadata";
import { getAdminSession } from "@/server/auth/guard";
import { currentMonth, getLedgerService } from "@/server/modules/ledger";
import type { LedgerTransaction } from "@/server/modules/ledger/contracts";
import { loadSiteSettings } from "@/server/modules/site-settings";
import LedgerCharts from "./LedgerCharts";

export const dynamic = "force-dynamic";

function requireModule(href: string): InterestModule {
  const found = interestModuleByHref(href);
  if (!found) throw new Error(`Missing interest module: ${href}`);
  return found;
}

const MODULE = requireModule("/ledger");

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return buildInterestMetadata({
    title: `${MODULE.pageTitle} · ${profile.siteTitle}`,
    description: MODULE.description,
    path: MODULE.href,
    indexable: MODULE.indexable,
  });
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 按月前后移动，避免依赖客户端时区。 */
function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [year, mon] = month.split("-");
  return `${year} 年 ${Number(mon)} 月`;
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const admin = await getAdminSession();

  if (!admin) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <Lock className="h-10 w-10 text-slate-400" />
        <h1 className="mt-4 text-xl font-semibold text-slate-800 dark:text-white">账本不对外</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          需要用管理员身份登录后查看收支与流水。
        </p>
        <Link
          href="/admin/login"
          className="mt-5 rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          去登录
        </Link>
      </div>
    );
  }

  const thisMonth = currentMonth();
  const requested = (await searchParams).month ?? "";
  const month = MONTH_PATTERN.test(requested) ? requested : thisMonth;

  const service = getLedgerService();
  const [summaryResult, listResult] = await Promise.allSettled([
    service.summary(month),
    service.transactions({ month, limit: 20, offset: 0 }),
  ]);
  const failed = summaryResult.status === "rejected" || listResult.status === "rejected";
  const summary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
  const list: { items: LedgerTransaction[]; total: number } =
    listResult.status === "fulfilled"
      ? listResult.value
      : { items: [], total: 0 };

  const budgets = summary?.budgets ?? [];
  const accounts = summary?.accounts ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white md:text-3xl">{MODULE.pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {monthLabel(month)} · 收入 {formatMoney(summary?.income ?? 0)} / 支出{" "}
            {formatMoney(summary?.expense ?? 0)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/ledger?month=${shiftMonth(month, -1)}`}
            aria-label="上一个月"
            className="rounded-full border border-white/40 p-2 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          {month !== thisMonth && (
            <Link
              href="/ledger"
              className="rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
            >
              回到本月
            </Link>
          )}
          <Link
            href={`/ledger?month=${shiftMonth(month, 1)}`}
            aria-label="下一个月"
            className="rounded-full border border-white/40 p-2 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            href="/admin/ledger"
            className="rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
          >
            去记账
          </Link>
        </div>
      </div>

      {failed ? (
        <AsyncState
          tone="error"
          title="账本数据加载失败"
          description="收支汇总或流水暂时取不到，请稍后重新加载。"
          actionLabel="重新加载"
          actionHref={MODULE.href}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "收入", value: summary?.income ?? 0, tone: "text-emerald-600" },
              { label: "支出", value: summary?.expense ?? 0, tone: "text-rose-600" },
              { label: "结余", value: summary?.balance ?? 0, tone: "text-slate-800 dark:text-white" },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
              >
                <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
                <p className={`mt-1 text-xl font-semibold ${card.tone}`}>
                  {formatMoney(card.value)}
                </p>
              </div>
            ))}
          </div>

          {budgets.length > 0 && (
            <section
              aria-labelledby="ledger-budget-title"
              className="mt-6 rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
            >
              <div className="flex items-baseline justify-between">
                <h2 id="ledger-budget-title" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  预算进度
                </h2>
                <Link href="/admin/ledger" className="text-xs text-sky-700 underline dark:text-sky-300">
                  调整预算
                </Link>
              </div>
              <ul className="mt-3 space-y-3">
                {budgets.map((budget) => {
                  const pct = budget.amount > 0 ? Math.round((budget.spent / budget.amount) * 100) : 0;
                  const over = budget.spent > budget.amount;
                  return (
                    <li key={budget.category_id}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-slate-700 dark:text-slate-200">{budget.category_name}</span>
                        <span className={`tabular-nums ${over ? "text-rose-600" : "text-slate-500 dark:text-slate-400"}`}>
                          {formatMoney(budget.spent)} / {formatMoney(budget.amount)}（{pct}%）
                        </span>
                      </div>
                      <div
                        className="mt-1 h-2 overflow-hidden rounded-full bg-slate-500/15"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.min(pct, 100)}
                        aria-label={`${budget.category_name}预算使用 ${pct}%`}
                      >
                        <div
                          className={`h-full rounded-full ${over ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-sky-500"}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <LedgerCharts daily={summary?.daily ?? []} byCategory={summary?.by_category ?? []} />

          {accounts.length > 0 && (
            <section className="mt-6 rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">账户余额</h2>
              <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {accounts.map((account) => (
                  <li key={account.id} className="flex items-baseline gap-2">
                    <span className="text-slate-500 dark:text-slate-400">{account.name}</span>
                    <span className={`tabular-nums ${account.balance < 0 ? "text-rose-600" : "text-slate-700 dark:text-slate-200"}`}>
                      {formatMoney(account.balance)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-6 rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
            <div className="flex items-center justify-between border-b border-white/30 px-4 py-3 dark:border-white/10">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">最近流水</span>
              {list.total > list.items.length && (
                <Link href="/admin/ledger" className="text-xs text-sky-700 underline dark:text-sky-300">
                  查看全部 {list.total} 笔
                </Link>
              )}
            </div>
            <div className="divide-y divide-white/30 dark:divide-white/10">
              {list.items.length === 0 && (
                <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">本月还没有流水。</p>
              )}
              {list.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-14 shrink-0 text-xs text-slate-400">
                    {formatMonthDay(item.occurred_at)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {item.category_name || "未分类"}
                    {item.merchant ? ` · ${item.merchant}` : ""}
                  </span>
                  <span
                    className={`shrink-0 tabular-nums font-medium ${
                      item.kind === "income" ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {formatMoney(item.kind === "income" ? item.amount : -item.amount, { sign: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
