"use client";

import { motion } from "framer-motion";
import { TrendingUp, Code2, ChevronDown } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

/**
 * recharts 静态引入会给 /garden 首屏多带约 600KB，而这两块图在服务端渲染时
 * 也只是一张空图（数据来自 useEffect 里的 fetch）。
 * 所以把它们单独拆成一个模块，由 GardenClient 用 next/dynamic 在客户端加载。
 */

const fadeIn = {
  hidden: { opacity: 0, scale: 0.94 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

export interface TrendPoint {
  date: string;
  文章: number;
  说说: number;
}

export interface CategorySlice {
  name: string;
  value: number;
  color: string;
}

interface GardenChartsProps {
  trendData: TrendPoint[];
  categoryData: CategorySlice[];
  activePie?: number;
  onActivePieChange: (index: number | undefined) => void;
}

const SLICE_UNITS: Record<string, string> = {
  文章: "篇",
  说说: "条",
  项目: "个",
  照片: "张",
};

function LineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; color: string; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-lg px-3 py-2 shadow-xl border border-slate-200/70 dark:border-white/10 text-xs">
      <p className="font-semibold text-slate-800 dark:text-slate-100 mb-1 tabular-nums">
        {label}
      </p>
      {payload.map((p) => (
        <div
          key={p.dataKey}
          className="flex items-center justify-between gap-3 py-0.5"
        >
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            {p.dataKey}
          </span>
          <span className="font-bold text-slate-900 dark:text-white tabular-nums">
            {p.value} {SLICE_UNITS[p.dataKey] ?? "项"}
          </span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload?: CategorySlice;
  }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const color = item.payload?.color ?? "#0284c7";
  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-lg px-3 py-2 shadow-xl border border-slate-200/70 dark:border-white/10 text-xs">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          {item.name}
        </span>
      </div>
      <p className="mt-1 font-bold text-slate-900 dark:text-white tabular-nums">
        {item.value} {SLICE_UNITS[item.name] ?? "项"} ({pct}%)
      </p>
    </div>
  );
}

export default function GardenCharts({
  trendData,
  categoryData,
  activePie,
  onActivePieChange,
}: GardenChartsProps) {
  const totalCategoryCount = categoryData.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* line chart */}
      <motion.div
        variants={fadeIn}
        className="lg:col-span-2 bg-white/75 dark:bg-slate-800/55 backdrop-blur-md rounded-xl p-4 md:p-5 border border-slate-200/60 dark:border-white/5 flex flex-col justify-between"
      >
        <div>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              近 10 日发布趋势
            </h2>
          </div>
          <div className="h-52 md:h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={trendData}
                margin={{ top: 5, right: 20, left: -10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.18)"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<LineTooltip />} />
                <Line
                  type="monotone"
                  dataKey="文章"
                  stroke="#0284c7"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#0284c7" }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="说说"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#f59e0b" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 可展开来源数据表（DESIGN.md 规范） */}
        <details className="mt-3 pt-3 border-t border-slate-200/60 dark:border-white/10 group">
          <summary className="cursor-pointer list-none flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded">
            <span>查看发布趋势来源数据表 ({trendData.length} 日)</span>
            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2.5 overflow-x-auto rounded-lg border border-slate-200/70 dark:border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 font-semibold">日期</th>
                  <th className="px-3 py-2 font-semibold text-right">文章 (篇)</th>
                  <th className="px-3 py-2 font-semibold text-right">说说 (条)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-white/5 text-slate-700 dark:text-slate-200">
                {trendData.map((row) => (
                  <tr
                    key={row.date}
                    className="hover:bg-slate-50/80 dark:hover:bg-white/5"
                  >
                    <td className="px-3 py-1.5 tabular-nums">{row.date}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {row.文章}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {row.说说}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </motion.div>

      {/* pie chart */}
      <motion.div
        variants={fadeIn}
        className="bg-white/75 dark:bg-slate-800/55 backdrop-blur-md rounded-xl p-4 md:p-5 border border-slate-200/60 dark:border-white/5 flex flex-col justify-between"
      >
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Code2 className="w-4 h-4 text-purple-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              内容分类占比
            </h2>
          </div>
          <div className="h-52 md:h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius="45%"
                  outerRadius="70%"
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                  {...{ activeIndex: activePie, activeOuterRadius: "75%" }}
                  onMouseEnter={(_, i) => onActivePieChange(i)}
                  onMouseLeave={() => onActivePieChange(undefined)}
                >
                  {categoryData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip total={totalCategoryCount} />} />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 可展开来源数据表（DESIGN.md 规范） */}
        <details className="mt-3 pt-3 border-t border-slate-200/60 dark:border-white/10 group">
          <summary className="cursor-pointer list-none flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded">
            <span>查看分类占比来源数据表</span>
            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2.5 overflow-x-auto rounded-lg border border-slate-200/70 dark:border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 font-semibold">分类</th>
                  <th className="px-3 py-2 font-semibold text-right">数量</th>
                  <th className="px-3 py-2 font-semibold text-right">占比</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-white/5 text-slate-700 dark:text-slate-200">
                {categoryData.map((item) => {
                  const pct =
                    totalCategoryCount > 0
                      ? `${((item.value / totalCategoryCount) * 100).toFixed(1)}%`
                      : "0.0%";
                  return (
                    <tr
                      key={item.name}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/5"
                    >
                      <td className="px-3 py-1.5 flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.name}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {item.value} {SLICE_UNITS[item.name] ?? ""}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {pct}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </motion.div>
    </div>
  );
}
