"use client";

import dynamic from "next/dynamic";

const MarkdownPlayground = dynamic(() => import("./MarkdownPlayground"), {
  ssr: false,
  loading: () => (
    <div className="p-6">
      <div className="h-[calc(100vh-220px)] min-h-[400px] animate-pulse rounded-xl bg-slate-200/40 dark:bg-slate-800/40" />
    </div>
  ),
});

export default function MarkdownPage() {
  return <MarkdownPlayground />;
}
