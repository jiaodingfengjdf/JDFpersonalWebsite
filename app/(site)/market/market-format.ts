import { formatMoney } from "@/lib/format";
import type { MarketIndexItem, MarketQuoteItem, MarketScope } from "@/server/modules/market/contracts";

export const MARKET_LABEL: Record<MarketScope, string> = { cn: "A股", us: "美股" };
export const KIND_LABEL: Record<MarketQuoteItem["kind"], string> = {
  stock: "股票",
  index: "指数",
  fund: "基金",
};

export function indexBadgeLabel(item: Pick<MarketIndexItem, "market" | "code">): string {
  if (item.code === "HSI" || item.code === "HSTECH") return "港股";
  return MARKET_LABEL[item.market];
}

// 指数点位以「点」计价，不是货币，所以不加 ¥/$；基金固定 4 位。
export function money(
  value: number,
  currency: "CNY" | "USD",
  kind: MarketQuoteItem["kind"] = "stock",
  sign = false,
): string {
  return formatMoney(value, { currency, kind, sign });
}

export function compactVolume(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(2)} 万`;
  return value.toLocaleString("zh-CN");
}

export function compactAmount(value: number | null | undefined, concise = false): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  const gap = concise ? "" : " ";
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)}${gap}万亿`;
  }
  if (value >= 100_000_000) {
    const yi = value / 100_000_000;
    const digits = concise && yi >= 100 ? 0 : 2;
    return `${yi.toFixed(digits)}${gap}亿`;
  }
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(concise ? 0 : 2)}${gap}万`;
  }
  return value.toLocaleString("zh-CN");
}

export function compactMarketCap(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)} 万亿`;
  }
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)} 亿`;
  }
  return `${(value / 10_000).toFixed(2)} 万`;
}

export function trendClass(value: number, flat = false): string {
  if (value > 0) return "text-rose-500";
  if (value < 0) return "text-emerald-600";
  return flat ? "text-slate-400" : "text-slate-600 dark:text-slate-300";
}

export function formatSignedPct(value: number): string {
  const prefix = value > 0 ? "+" : value < 0 ? "" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

export function formatSignedPoint(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}`;
}

export interface MarketPresetItem {
  market: MarketScope;
  kind: MarketQuoteItem["kind"];
  code: string;
  name: string;
  tag: string;
}

export interface MarketPresetGroup {
  key: "etf" | "fund" | "cn" | "us";
  label: string;
  items: MarketPresetItem[];
}

export const PRESET_GROUPS: MarketPresetGroup[] = [
  {
    key: "etf",
    label: "宽基与行业ETF",
    items: [
      { market: "cn", kind: "stock", code: "510300", name: "沪深300ETF", tag: "场内ETF" },
      { market: "cn", kind: "stock", code: "513100", name: "纳指ETF", tag: "场内ETF" },
      { market: "cn", kind: "stock", code: "518880", name: "黄金ETF", tag: "场内ETF" },
      { market: "cn", kind: "stock", code: "588000", name: "科创50ETF", tag: "场内ETF" },
      { market: "cn", kind: "stock", code: "159915", name: "创业板ETF", tag: "场内ETF" },
    ],
  },
  {
    key: "fund",
    label: "明星公募基金",
    items: [
      { market: "cn", kind: "fund", code: "110011", name: "易方达优质精选", tag: "公募基金" },
      { market: "cn", kind: "fund", code: "161725", name: "招商中证白酒", tag: "公募基金" },
      { market: "cn", kind: "fund", code: "005827", name: "易方达蓝筹精选", tag: "公募基金" },
      { market: "cn", kind: "fund", code: "000071", name: "华夏恒生ETF联接", tag: "公募基金" },
    ],
  },
  {
    key: "cn",
    label: "A股核心资产",
    items: [
      { market: "cn", kind: "stock", code: "600036", name: "招商银行", tag: "A股" },
      { market: "cn", kind: "stock", code: "300750", name: "宁德时代", tag: "A股" },
      { market: "cn", kind: "stock", code: "002594", name: "比亚迪", tag: "A股" },
      { market: "cn", kind: "stock", code: "600900", name: "长江电力", tag: "A股" },
    ],
  },
  {
    key: "us",
    label: "美股科技龙头",
    items: [
      { market: "us", kind: "stock", code: "AAPL", name: "苹果", tag: "美股" },
      { market: "us", kind: "stock", code: "NVDA", name: "英伟达", tag: "美股" },
      { market: "us", kind: "stock", code: "MSFT", name: "微软", tag: "美股" },
      { market: "us", kind: "stock", code: "TSLA", name: "特斯拉", tag: "美股" },
      { market: "us", kind: "stock", code: "GOOGL", name: "谷歌", tag: "美股" },
    ],
  },
];
