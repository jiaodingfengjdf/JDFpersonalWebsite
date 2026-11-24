import { z } from "zod";

export const marketKind = z.enum(["stock", "index", "fund"]);
export type { MarketKind } from "./provider";

export const marketScope = z.enum(["cn", "us"]);
export type MarketScope = z.infer<typeof marketScope>;

export const watchInput = z
  .object({
    market: marketScope.default("cn"),
    kind: marketKind,
    code: z
      .string()
      .trim()
      .min(1, "代码不能为空")
      .max(12)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().max(40).default(""),
    cost: z.coerce.number().min(0).max(1_000_000).nullable().default(null),
    shares: z.coerce.number().min(0).max(1_000_000_000).nullable().default(null),
    sort: z.coerce.number().int().min(0).max(9999).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.market === "cn" && !/^\d{6}$/.test(value.code)) {
      ctx.addIssue({ code: "custom", path: ["code"], message: "A 股代码应为 6 位数字" });
    }
    if (value.market === "us" && !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(value.code)) {
      ctx.addIssue({ code: "custom", path: ["code"], message: "美股代码只允许字母、数字、点与连字符" });
    }
    if (value.market === "us" && value.kind === "fund") {
      ctx.addIssue({ code: "custom", path: ["kind"], message: "美股不支持基金类型" });
    }
  });

export type WatchInput = z.infer<typeof watchInput>;

export const watchIdParams = z.object({ id: z.coerce.number().int().positive() });

export const marketPeriod = z.enum(["intraday", "day", "week", "month"]);
export type MarketPeriod = z.infer<typeof marketPeriod>;

export const historyQuery = z.object({
  id: z.coerce.number().int().positive(),
  period: marketPeriod.default("day"),
});

export const alertRule = z.enum(["up_pct", "down_pct", "price_above", "price_below"]);
export type AlertRule = z.infer<typeof alertRule>;

export const alertInput = z
  .object({
    watch_id: z.coerce.number().int().positive(),
    rule: alertRule,
    threshold: z.coerce.number().finite().min(0.0001).max(1_000_000),
    enabled: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if ((value.rule === "up_pct" || value.rule === "down_pct") && value.threshold > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["threshold"],
        message: "涨跌幅阈值应在 0.01 ~ 100 之间",
      });
    }
  });

export type AlertInput = z.infer<typeof alertInput>;

export const alertUpdateInput = z
  .object({
    rule: alertRule,
    threshold: z.coerce.number().finite().min(0.0001).max(1_000_000),
    enabled: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if ((value.rule === "up_pct" || value.rule === "down_pct") && value.threshold > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["threshold"],
        message: "涨跌幅阈值应在 0.01 ~ 100 之间",
      });
    }
  });

export type AlertUpdateInput = z.infer<typeof alertUpdateInput>;

export const alertIdParams = z.object({ id: z.coerce.number().int().positive() });

export interface MarketAlertItem {
  id: number;
  watch_id: number;
  name: string;
  code: string;
  kind: "stock" | "index" | "fund";
  rule: AlertRule;
  threshold: number;
  enabled: boolean;
  last_fired_at: string | null;
}

export interface MarketQuoteItem {
  id: number;
  kind: "stock" | "index" | "fund";
  market: MarketScope;
  code: string;
  name: string;
  price: number;
  change: number;
  change_pct: number;
  time: string;
  stale: boolean;
  /** 计价货币：A 股/基金为 CNY，美股为 USD */
  currency: "CNY" | "USD";
  cost: number | null;
  shares: number | null;
  /** 有持仓时才有：市值 / 盈亏 / 盈亏率 */
  market_value: number | null;
  profit: number | null;
  profit_pct: number | null;
}

/** 按币种分开的持仓汇总，避免把美元和人民币加在一起。 */
export interface MarketCurrencyTotals {
  currency: "CNY" | "USD";
  value: number | null;
  cost: number;
  profit: number | null;
  unpriced: number;
}

export interface MarketOverview {
  items: MarketQuoteItem[];
  totals: MarketCurrencyTotals[];
  /** 兼容字段：仅统计人民币持仓 */
  total_value: number | null;
  total_cost: number;
  total_profit: number | null;
  unpriced_holdings: number;
  fetched_at: string;
}

export interface MarketIndexItem {
  code: string;
  name: string;
  market: MarketScope;
  price: number;
  change: number;
  change_pct: number;
  stale: boolean;
}

export interface MarketCandle {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export interface MarketLinePoint {
  /** 分时：2026-11-23 22:30；日/周/月：2026-11-23 */
  label: string;
  value: number;
  /** 分时均价 */
  avg?: number;
  volume?: number;
}

export interface MarketHistory {
  period: MarketPeriod;
  series: "candle" | "line";
  candles: MarketCandle[];
  points: MarketLinePoint[];
  prev_close: number | null;
  source: "eastmoney" | "fund" | "snapshot";
  stale: boolean;
  note: string;
  updated_at: string;
}

export interface MarketHistoryPoint {
  price: number;
  captured_at: number;
}
