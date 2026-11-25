import { createElement, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type GlassTag = "div" | "section" | "article" | "aside" | "p" | "ul" | "li";

export type GlassPanelProps = HTMLAttributes<HTMLElement> & {
  as?: GlassTag;
  tone?: "solid" | "soft";
  padding?: "sm" | "md" | "lg";
  className?: string;
  children?: ReactNode;
};

const BASE_CLASS = "rounded-2xl border border-white/40 backdrop-blur-md dark:border-white/10";

// 站点背景是原生渐层，这里只叠加半透明色，不能写死不透明底色。
const TONE_CLASS: Record<NonNullable<GlassPanelProps["tone"]>, string> = {
  solid: "bg-white/45 dark:bg-slate-800/45",
  soft: "bg-white/40 dark:bg-slate-800/40",
};

const PADDING_CLASS: Record<NonNullable<GlassPanelProps["padding"]>, string> = {
  sm: "p-3",
  md: "p-4",
  lg: "p-8",
};

export default function GlassPanel({
  as: Tag = "div",
  tone = "solid",
  padding,
  className,
  children,
  ...rest
}: GlassPanelProps) {
  return createElement(
    Tag,
    {
      ...rest,
      className: cn(BASE_CLASS, TONE_CLASS[tone], padding && PADDING_CLASS[padding], className),
    },
    children,
  );
}
