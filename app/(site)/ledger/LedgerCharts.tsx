"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LedgerSummary } from "@/server/modules/ledger/contracts";

const COLORS = ["#0284c7", "#f59e0b", "#8b5cf6", "#10b981", "#f43f5e", "#0ea5e9", "#64748b"];
const money = (value: number) =>
  value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Props = {
  daily: LedgerSummary["daily"];
  byCategory: LedgerSummary["by_category"];
};

/** 支出分类占比，最多展示 6 类，其余合并为「其他」。 */
function expenseShares(byCategory: LedgerSummary["by_category"]) {
  const expenses = byCategory
    .filter((item) => item.kind === "expense" && item.total > 0)
    .sort((a, b) => b.total - a.total);
  const top = expenses.slice(0, 6).map((item) => ({
    name: item.category_name,
    value: item.total,
  }));
  const rest = expenses.slice(6).reduce((sum, item) => sum + item.total, 0);
  if (rest > 0) top.push({ name: "其他", value: Number(rest.toFixed(2)) });
  return top;
}

export default function LedgerCharts({ daily, byCategory }: Props) {
  const shares = expenseShares(byCategory);

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <section
        aria-labelledby="ledger-trend-title"
        className="rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
      >
        <h2 id="ledger-trend-title" className="text-sm font-medium text-slate-700 dark:text-slate-200">
          每日收支
        </h2>
        {daily.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">本月还没有流水，图表会在记账后出现。</p>
        ) : (
          <>
            <div className="mt-2 h-56 text-slate-600 dark:text-slate-300">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={daily} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="ledger-income" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ledger-expense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.15} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => value.slice(5)}
                    tick={{ fill: "currentColor", fontSize: 10 }}
                    minTickGap={24}
                  />
                  <YAxis
                    width={56}
                    tickFormatter={(value: number) => value.toLocaleString("zh-CN")}
                    tick={{ fill: "currentColor", fontSize: 10 }}
                  />
                  <Tooltip
                    labelFormatter={(value) => String(value)}
                    formatter={(value, name) => [`¥ ${money(Number(value))}`, String(name)]}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    name="收入"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#ledger-income)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    name="支出"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    fill="url(#ledger-expense)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <details className="mt-3 text-sm text-slate-700 dark:text-slate-200">
              <summary className="cursor-pointer">查看每日明细</summary>
              <table className="mt-2 w-full text-left">
                <thead>
                  <tr>
                    <th scope="col">日期</th>
                    <th scope="col" className="text-right">收入</th>
                    <th scope="col" className="text-right">支出</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-500/20">
                  {daily.map((day) => (
                    <tr key={day.date}>
                      <td className="py-1.5">{day.date}</td>
                      <td className="text-right tabular-nums">{money(day.income)}</td>
                      <td className="text-right tabular-nums">{money(day.expense)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </section>

      <section
        aria-labelledby="ledger-category-title"
        className="rounded-2xl border border-white/40 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45"
      >
        <h2 id="ledger-category-title" className="text-sm font-medium text-slate-700 dark:text-slate-200">
          支出分类
        </h2>
        {shares.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">本月还没有支出记录。</p>
        ) : (
          <>
            <div className="mt-2 h-44 text-slate-600 dark:text-slate-300">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={shares}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="52%"
                    outerRadius="82%"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {shares.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `¥ ${money(Number(value))}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {shares.map((item, index) => (
                <li key={item.name} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {item.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                    {money(item.value)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
