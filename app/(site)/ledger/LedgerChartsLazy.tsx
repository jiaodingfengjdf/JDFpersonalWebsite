"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type LedgerChartsType from "./LedgerCharts";

const LedgerChartsDynamic = dynamic(() => import("./LedgerCharts"), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full animate-pulse rounded-2xl bg-slate-200/40 dark:bg-slate-800/40" />
  ),
});

export default function LedgerChartsLazy(
  props: ComponentProps<typeof LedgerChartsType>,
) {
  return <LedgerChartsDynamic {...props} />;
}
