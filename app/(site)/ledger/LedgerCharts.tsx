"use client";

import { useMemo, useState } from "react";
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
import FilterTabs from "@/components/site/FilterTabs";
import { formatMoney } from "@/lib/format";
import type { LedgerKind, LedgerSummary } from "@/server/modules/ledger/contracts";

const COLORS = ["#0284c7", "#f59e0b", "#8b5cf6", "#10b981", "#f43f5e", "#0ea5e9", "#64748b"];

type Props = {
  daily: LedgerSummary["daily"];
  byCategory: LedgerSummary["by_category"];
};

/** 按收支类型计算分类占比，最多展示 6 类，其余合并为「其他」。 */
function categoryShares(byCategory: LedgerSummary["by_category"], kind: LedgerKind) {
  const matched = byCategory
    .filter((item) => item.kind === kind && item.total > 0)
    .sort((a, b) => b.total - a.total);
  const grandTotal = matched.reduce((sum, item) => sum + item.total, 0);
  const top = matched.slice(0, 6).map((item) => ({
    name: item.category_name || "未分类",
    value: item.total,
    pct: grandTotal > 0 ? (item.total / grandTotal) * 100 : 0,
  }));
  const rest = matched.slice(6).reduce((sum, item) => sum + item.total, 0);
  if (rest > 0) {
    top.push({
      name: "其他",
      value: Number(rest.toFixed(2)),
      pct: grandTotal > 0 ? (rest / grandTotal) * 100 : 0,
    });
  }
  return { shares: top, allRows: matched, grandTotal };
}

export default function LedgerCharts({ daily, byCategory }: Props) {
  const [pieKind, setPieKind] = useState<LedgerKind>("expense");

  const { shares, allRows, grandTotal } = useMemo(
    () => categoryShares(byCategory, pieKind),
    [byCategory, pieKind],
  );

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
                    formatter={(value, name) => [formatMoney(Number(value)), String(name)]}
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
              <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400">
                查看每日明细
              </summary>
              <table className="mt-2 w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th scope="col" className="py-1 font-normal">日期</th>
                    <th scope="col" className="py-1 text-right font-normal">收入</th>
                    <th scope="col" className="py-1 text-right font-normal">支出</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-500/20">
                  {daily.map((day) => (
                    <tr key={day.date}>
                      <td className="py-1.5">{day.date}</td>
                      <td className="text-right tabular-nums">{formatMoney(day.income)}</td>
                      <td className="text-right tabular-nums">{formatMoney(day.expense)}</td>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ledger-category-title" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {pieKind === "expense" ? "支出构成" : "收入构成"}
          </h2>
          <FilterTabs
            items={[
              { key: "expense" as const, label: "支出构成" },
              { key: "income" as const, label: "收入构成" },
            ]}
            value={pieKind}
            onChange={(next) => setPieKind(next)}
            variant="segmented"
            aria-label="分类图表收支切换"
          />
        </div>

        {shares.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            本月还没有{pieKind === "expense" ? "支出" : "收入"}记录。
          </p>
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
                  <Tooltip
                    formatter={(value) => {
                      const num = Number(value);
                      const pct = grandTotal > 0 ? ((num / grandTotal) * 100).toFixed(1) : "0.0";
                      return `${formatMoney(num)} (${pct}%)`;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1.5 text-sm">
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
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">
                    {item.pct.toFixed(1)}%
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
                    {formatMoney(item.value)}
                  </span>
                </li>
              ))}
            </ul>

            <details className="mt-3 text-xs text-slate-600 dark:text-slate-300">
              <summary className="cursor-pointer text-slate-500 dark:text-slate-400">
                查看全部分类明细（{allRows.length} 类）
              </summary>
              <table className="mt-2 w-full text-left">
                <thead>
                  <tr className="text-slate-400">
                    <th scope="col" className="py-1 font-normal">分类</th>
                    <th scope="col" className="py-1 text-right font-normal">占比</th>
                    <th scope="col" className="py-1 text-right font-normal">金额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-500/20">
                  {allRows.map((row) => {
                    const pct = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;
                    return (
                      <tr key={`${row.kind}-${row.category_id ?? "none"}-${row.category_name}`}>
                        <td className="py-1">{row.category_name || "未分类"}</td>
                        <td className="py-1 text-right tabular-nums">{pct.toFixed(1)}%</td>
                        <td className="py-1 text-right tabular-nums">{formatMoney(row.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          </>
        )}
      </section>
    </div>
  );
}
