import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { getAdminSession } from "@/server/auth/guard";
import { currentMonth, getLedgerService } from "@/server/modules/ledger";
import { loadSiteSettings } from "@/server/modules/site-settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadSiteSettings();
  return {
    title: `记账 · ${profile.siteTitle}`,
    description: "私人账本：收支、预算与流水",
    robots: { index: false, follow: false },
  };
}

const money = (value: number) =>
  value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function LedgerPage() {
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

  const month = currentMonth();
  const service = getLedgerService();
  const [summary, list] = await Promise.all([
    service.summary(month).catch(() => null),
    service.transactions({ month, limit: 20, offset: 0 }).catch(() => ({ items: [], total: 0 })),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative z-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">记账</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {month} · 收入 ¥{money(summary?.income ?? 0)} / 支出 ¥{money(summary?.expense ?? 0)}
          </p>
        </div>
        <Link
          href="/admin/ledger"
          className="rounded-full border border-white/40 px-3 py-1.5 text-xs text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300"
        >
          去记账
        </Link>
      </div>

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
            <p className={`mt-1 text-xl font-semibold ${card.tone}`}>¥ {money(card.value)}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-white/40 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45">
        <div className="border-b border-white/30 px-4 py-3 text-sm font-medium text-slate-700 dark:border-white/10 dark:text-slate-200">
          最近流水
        </div>
        <div className="divide-y divide-white/30 dark:divide-white/10">
          {list.items.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">本月还没有记录。</p>
          )}
          {list.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-14 shrink-0 text-xs text-slate-400">
                {new Date(item.occurred_at).toLocaleDateString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                })}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                {item.category_name || "未分类"}
                {item.merchant ? ` · ${item.merchant}` : ""}
              </span>
              <span
                className={`shrink-0 font-medium ${
                  item.kind === "income" ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {item.kind === "income" ? "+" : "-"}
                {money(item.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
