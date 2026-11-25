"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** 单个筛选项。带 href 时整组按链接模式渲染，否则按受控按钮模式渲染。 */
export type FilterTabItem<K extends string = string> = {
  key: K;
  label: ReactNode;
  href?: string;
  disabled?: boolean;
  title?: string;
};

export type FilterTabsVariant = "pill" | "segmented" | "underline";

type FilterTabsProps<K extends string> = {
  items: readonly FilterTabItem<K>[];
  /** 受控模式的当前值；链接模式用来标记 aria-current。 */
  value?: K;
  /** 受控模式的选择回调；链接模式不传。 */
  onChange?: (key: K) => void;
  variant?: FilterTabsVariant;
  "aria-label"?: string;
  /** tablist 容器样式，可与预设合并（twMerge 处理冲突）。 */
  className?: string;
  /** 所有 tab 的附加样式。 */
  tabClassName?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  disabledClassName?: string;
};

const CONTAINER_CLASS: Record<FilterTabsVariant, string> = {
  pill: "flex flex-wrap gap-2",
  segmented: "flex gap-1 rounded-full border border-white/40 p-1 dark:border-white/10",
  underline: "flex flex-wrap gap-1 border-b border-white/30 pb-2 dark:border-white/10",
};

const TAB_CLASS: Record<FilterTabsVariant, string> = {
  pill: "rounded-full border px-3 py-1.5 text-xs transition-colors",
  segmented: "rounded-full px-3 py-1 text-xs transition",
  underline: "rounded-md px-2.5 py-1 text-xs transition",
};

const ACTIVE_CLASS: Record<FilterTabsVariant, string> = {
  pill: "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  segmented: "bg-sky-500 text-white",
  underline: "bg-sky-500 text-white",
};

const INACTIVE_CLASS: Record<FilterTabsVariant, string> = {
  pill: "border-white/40 text-slate-600 hover:border-sky-300 dark:border-white/10 dark:text-slate-300",
  segmented: "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10",
  underline: "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10",
};

const DISABLED_CLASS = "cursor-not-allowed text-slate-300 dark:text-slate-600";

export default function FilterTabs<K extends string = string>({
  items,
  value,
  onChange,
  variant = "pill",
  className,
  tabClassName,
  activeClassName,
  inactiveClassName,
  disabledClassName,
  "aria-label": ariaLabel,
}: FilterTabsProps<K>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // 所有项都带 href 才算链接模式，避免混用模式时出现不可点击的 tab。
  const linkMode = items.length > 0 && items.every((item) => item.href !== undefined);

  const itemClass = (item: FilterTabItem<K>, active: boolean) =>
    cn(
      TAB_CLASS[variant],
      item.disabled
        ? cn(DISABLED_CLASS, disabledClassName)
        : active
          ? cn(ACTIVE_CLASS[variant], activeClassName)
          : cn(INACTIVE_CLASS[variant], inactiveClassName),
      tabClassName,
    );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const current = buttonRefs.current.findIndex((node) => node === event.target);
    if (current < 0) return;
    const enabled = items
      .map((item, index) => (item.disabled ? -1 : index))
      .filter((index) => index >= 0);
    if (enabled.length === 0) return;
    const position = enabled.indexOf(current);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = enabled[(position + step + enabled.length) % enabled.length];
    if (next === undefined) return;
    event.preventDefault();
    buttonRefs.current[next]?.focus();
    onChange?.(items[next].key);
  }

  if (linkMode) {
    return (
      <div className={cn(CONTAINER_CLASS[variant], className)} aria-label={ariaLabel}>
        {items.map((item) => {
          if (!item.href) return null;
          const active = value === item.key;
          return (
            <Link
              key={item.key}
              href={item.href}
              title={item.title}
              aria-current={active ? "page" : undefined}
              aria-disabled={item.disabled || undefined}
              className={itemClass(item, active)}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(CONTAINER_CLASS[variant], className)}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => {
        const active = value === item.key;
        return (
          <button
            key={item.key}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            title={item.title}
            onClick={() => {
              if (!item.disabled) onChange?.(item.key);
            }}
            className={itemClass(item, active)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
