"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MarketHistoryPoint } from "@/server/modules/market/contracts";

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
const formatPrice = (price: number) => price.toLocaleString("zh-CN", { maximumFractionDigits: 4 });

export default function MarketHistory({ points }: { points: MarketHistoryPoint[] }) {
  return (
    <>
      <div className="h-56 text-slate-600 dark:text-slate-300">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={points} margin={{ top: 8, right: 15, bottom: 6, left: 0 }}>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.15} />
            <XAxis type="number" dataKey="captured_at" domain={["dataMin", "dataMax"]} tickFormatter={(value) => dateTime.format(value)} tick={{ fill: "currentColor", fontSize: 10 }} minTickGap={28} />
            <YAxis domain={["auto", "auto"]} width={48} tickFormatter={formatPrice} tick={{ fill: "currentColor", fontSize: 10 }} />
            <Tooltip labelFormatter={(value) => dateTime.format(Number(value))} formatter={(value) => formatPrice(Number(value))} />
            <Line dataKey="price" name="报价" stroke="#0284c7" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm text-slate-700 dark:text-slate-200">
        <summary className="cursor-pointer">查看报价明细</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr><th scope="col">记录时间</th><th scope="col" className="text-right">报价</th></tr></thead>
          <tbody className="divide-y divide-slate-500/20">
            {points.slice().reverse().map((point) => (
              <tr key={point.captured_at}>
                <td className="py-1.5">{dateTime.format(point.captured_at)}</td>
                <td className="text-right tabular-nums">{formatPrice(point.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
