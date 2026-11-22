import { z } from "zod";

export const marketKind = z.enum(["stock", "index", "fund"]);
export type { MarketKind } from "./provider";

export const watchInput = z.object({
  kind: marketKind,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "代码应为 6 位数字")
    .transform((value) => value.trim()),
  name: z.string().trim().max(40).default(""),
  cost: z.coerce.number().min(0).max(1_000_000).nullable().default(null),
  shares: z.coerce.number().min(0).max(1_000_000_000).nullable().default(null),
  sort: z.coerce.number().int().min(0).max(9999).default(0),
});

export type WatchInput = z.infer<typeof watchInput>;

export const watchIdParams = z.object({ id: z.coerce.number().int().positive() });

export interface MarketQuoteItem {
  id: number;
  kind: "stock" | "index" | "fund";
  code: string;
  name: string;
  price: number;
  change: number;
  change_pct: number;
  time: string;
  stale: boolean;
  cost: number | null;
  shares: number | null;
  /** 有持仓时才有：市值 / 盈亏 / 盈亏率 */
  market_value: number | null;
  profit: number | null;
  profit_pct: number | null;
}

export interface MarketOverview {
  items: MarketQuoteItem[];
  total_value: number;
  total_cost: number;
  total_profit: number;
  fetched_at: string;
}
