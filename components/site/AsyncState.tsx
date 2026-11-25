"use client";

import Link from "next/link";
import { AlertTriangle, LoaderCircle, SearchX } from "lucide-react";

/**
 * 兴趣栏目统一的加载 / 空 / 错误三态。
 *
 * 服务端页面传 `actionHref`（重试链接），客户端页面传 `onAction`（回调）；
 * 两者都不传时只显示说明文字。此前 10 个页面共有 6 种空态、5 种错误态、4 种加载态。
 */
export default function AsyncState({
  tone,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  compact = false,
}: {
  tone: "loading" | "empty" | "error";
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const toneClass =
    tone === "error"
      ? "text-rose-500"
      : tone === "loading"
        ? "text-sky-500"
        : "text-slate-400";
  const Icon = tone === "error" ? AlertTriangle : tone === "loading" ? LoaderCircle : SearchX;

  return (
    <div
      role={tone === "error" ? "alert" : tone === "loading" ? "status" : undefined}
      className={`flex flex-col items-center justify-center rounded-2xl border border-white/40 bg-white/40 text-center backdrop-blur-md dark:border-white/10 dark:bg-slate-900/40 ${
        compact ? "gap-1 px-4 py-6" : "gap-2 px-5 py-12"
      }`}
    >
      <Icon
        className={`h-6 w-6 ${toneClass} ${tone === "loading" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {description ? (
        <p className="max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      ) : null}
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-2 rounded-full bg-sky-500 px-3 py-1 text-xs text-white transition hover:bg-sky-600"
        >
          {actionLabel}
        </Link>
      ) : actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 rounded-full bg-sky-500 px-3 py-1 text-xs text-white transition hover:bg-sky-600"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
