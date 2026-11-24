import type { KlineBar, NavPoint } from "./eastmoney";
import type { MarketCandle, MarketLinePoint } from "./contracts";

/** 各周期展示的最大点数：控制在屏幕上单根 K 线仍有足够宽度。 */
export const SERIES_LIMIT = { day: 120, week: 104, month: 72 } as const;

export function toCandle(bar: KlineBar): MarketCandle {
  return {
    date: bar.date,
    open: bar.open,
    close: bar.close,
    high: bar.high,
    low: bar.low,
    volume: bar.volume,
  };
}

/** 自然周（周一为起点）的键，按 UTC 计算，避免本机时区影响分组。 */
function weekKey(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day);
  const offset = (new Date(time).getUTCDay() + 6) % 7;
  return new Date(time - offset * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 日线聚合为周线/月线：开=首日开，收=末日收，高=区间最高，低=区间最低，
 * 量=区间求和；日期取该区间最后一个交易日，便于和上游周/月线对齐。
 * 入参需按日期升序。
 */
export function aggregateCandles(
  bars: KlineBar[],
  period: "week" | "month",
): MarketCandle[] {
  const output: MarketCandle[] = [];
  let current: MarketCandle | null = null;
  let currentKey = "";

  for (const bar of bars) {
    const key = period === "week" ? weekKey(bar.date) : bar.date.slice(0, 7);
    if (!current || key !== currentKey) {
      if (current) output.push(current);
      currentKey = key;
      current = toCandle(bar);
      continue;
    }
    current.close = bar.close;
    current.high = Math.max(current.high, bar.high);
    current.low = Math.min(current.low, bar.low);
    current.volume += bar.volume;
    current.date = bar.date;
  }

  if (current) output.push(current);
  return output;
}

/** 基金净值聚合：周/月取区间最后一个净值，标签用该净值日期。 */
export function aggregateNav(
  points: NavPoint[],
  period: "day" | "week" | "month",
): MarketLinePoint[] {
  if (period === "day") {
    return points.map((point) => ({ label: point.date, value: point.value }));
  }

  const output: MarketLinePoint[] = [];
  let currentKey = "";
  for (const point of points) {
    const key = period === "week" ? weekKey(point.date) : point.date.slice(0, 7);
    if (key !== currentKey) {
      currentKey = key;
      output.push({ label: point.date, value: point.value });
      continue;
    }
    const last = output[output.length - 1];
    last.label = point.date;
    last.value = point.value;
  }
  return output;
}

/** 只保留最近 limit 条。 */
export function takeLast<T>(items: T[], limit: number): T[] {
  return items.length > limit ? items.slice(items.length - limit) : items;
}
