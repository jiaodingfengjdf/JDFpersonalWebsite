import { describe, expect, it } from "vitest";
import type { KlineBar, NavPoint } from "./eastmoney";
import { aggregateCandles, aggregateNav, takeLast, toCandle } from "./series";

const bar = (
  date: string,
  open: number,
  close: number,
  high: number,
  low: number,
  volume = 100,
): KlineBar => ({ date, open, close, high, low, volume, amount: 0 });

describe("market series aggregation", () => {
  it("aggregates daily bars into natural weeks", () => {
    const bars = [
      bar("2026-11-16", 10, 11, 12, 9.5, 100), // 周一
      bar("2026-11-17", 11, 10.5, 11.8, 10.2, 200),
      bar("2026-11-20", 10.5, 12, 13, 10, 300), // 周五收盘
      bar("2026-11-23", 12, 11.2, 12.4, 11, 400), // 下周一
      bar("2026-11-24", 11.2, 11.5, 11.9, 11.1, 500),
    ];

    const weekly = aggregateCandles(bars, "week");

    expect(weekly).toHaveLength(2);
    expect(weekly[0]).toEqual({
      date: "2026-11-20",
      open: 10,
      close: 12,
      high: 13,
      low: 9.5,
      volume: 600,
    });
    expect(weekly[1]).toMatchObject({ date: "2026-11-24", open: 12, close: 11.5, volume: 900 });
  });

  it("aggregates daily bars by calendar month", () => {
    const monthly = aggregateCandles(
      [
        bar("2026-10-29", 8, 9, 9.4, 7.8),
        bar("2026-10-30", 9, 8.6, 9.6, 8.4),
        bar("2026-11-02", 8.6, 10, 10.2, 8.5),
        bar("2026-11-24", 10, 11, 11.6, 9.9),
      ],
      "month",
    );

    expect(monthly).toHaveLength(2);
    expect(monthly[0]).toMatchObject({ date: "2026-10-30", open: 8, close: 8.6, high: 9.6, low: 7.8 });
    expect(monthly[1]).toMatchObject({ date: "2026-11-24", open: 8.6, close: 11, high: 11.6, low: 8.5 });
  });

  it("keeps a single week when only part of the range exists", () => {
    const weekly = aggregateCandles([bar("2026-11-23", 5, 6, 6.2, 4.9)], "week");
    expect(weekly).toEqual([{ date: "2026-11-23", open: 5, close: 6, high: 6.2, low: 4.9, volume: 100 }]);
    expect(aggregateCandles([], "week")).toEqual([]);
  });

  it("takes the last NAV of each week and month", () => {
    const points: NavPoint[] = [
      { date: "2026-11-13", value: 2.1, changePct: 0 },
      { date: "2026-11-16", value: 2.2, changePct: 0 },
      { date: "2026-11-19", value: 2.3, changePct: 0 },
      { date: "2026-11-23", value: 2.4, changePct: 0 },
    ];

    expect(aggregateNav(points, "day")).toHaveLength(4);
    expect(aggregateNav(points, "week")).toEqual([
      { label: "2026-11-13", value: 2.1 },
      { label: "2026-11-19", value: 2.3 },
      { label: "2026-11-23", value: 2.4 },
    ]);
    expect(aggregateNav(points, "month")).toEqual([{ label: "2026-11-23", value: 2.4 }]);
  });

  it("trims to the newest points and maps bars to candles", () => {
    expect(takeLast([1, 2, 3, 4], 2)).toEqual([3, 4]);
    expect(takeLast([1], 5)).toEqual([1]);
    expect(toCandle(bar("2026-11-24", 1, 2, 3, 0.5))).toEqual({
      date: "2026-11-24",
      open: 1,
      close: 2,
      high: 3,
      low: 0.5,
      volume: 100,
    });
  });
});
