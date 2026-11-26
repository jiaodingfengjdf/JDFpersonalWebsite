"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MarketCandle,
  MarketHistory,
  MarketLinePoint,
  MarketPeriod,
} from "@/server/modules/market/contracts";

const UP = "#f43f5e";
const DOWN = "#10b981";
const GRID = "rgba(148, 163, 184, 0.18)";

const HEIGHT = 336;
const AXIS_W = 64;
const PAD_LEFT = 8;
const PAD_TOP = 10;
const PRICE_H = 232;
const VOL_H = 54;
const GAP = 12;

const MA_COLORS = ["#f59e0b", "#8b5cf6", "#0ea5e9"] as const;
const MA_WINDOWS = [5, 10, 20] as const;
type MaWindow = (typeof MA_WINDOWS)[number];
type ZoomRange = "30" | "60" | "all";

const ZOOM_OPTIONS: Array<{ key: ZoomRange; label: string }> = [
  { key: "30", label: "近30根" },
  { key: "60", label: "近60根" },
  { key: "all", label: "全部" },
];

function decimals(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 100) return 2;
  if (abs >= 1) return 2;
  return 4;
}

function priceText(value: number, unit: string, digits?: number): string {
  const places = digits ?? decimals(value);
  return `${unit}${value.toLocaleString("zh-CN", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  })}`;
}

function compactNumber(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(2)} 万`;
  return value.toLocaleString("zh-CN");
}

function movingAverage(values: number[], window: number): Array<number | null> {
  const output: Array<number | null> = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= window) sum -= values[index - window];
    output.push(index >= window - 1 ? sum / window : null);
  }
  return output;
}

// 横轴刻度：首尾一定包含，中间等距取整。
function tickIndexes(length: number, count: number): number[] {
  if (length <= 0 || count <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, index) => index);
  const output: number[] = [];
  for (let slot = 0; slot < count; slot += 1) {
    output.push(Math.round((slot * (length - 1)) / (count - 1)));
  }
  return [...new Set(output)];
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (next > 0) setWidth(Math.max(320, Math.round(next)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

// 横轴日期按周期收敛粒度：月K 用「YYYY-MM」，周K/日K 用「MM-DD」。
function candleAxisLabel(date: string, period: MarketPeriod): string {
  return period === "month" ? date.slice(0, 7) : date.slice(5);
}

function CandleChart({
  candles,
  unit,
  period,
}: {
  candles: MarketCandle[];
  unit: string;
  period: MarketPeriod;
}) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [zoom, setZoom] = useState<ZoomRange>("all");
  const [enabledMas, setEnabledMas] = useState<Record<MaWindow, boolean>>({
    5: true,
    10: true,
    20: true,
  });

  // 先在全量日线上算好均线，再按缩放窗口切片，避免近30根/近60根左侧丢掉均线预热区间。
  const { visibleCandles, sliceStart, slicedMas } = useMemo(() => {
    const allCloses = candles.map((candle) => candle.close);
    const fullMas = MA_WINDOWS.map((window) => ({
      window,
      values: movingAverage(allCloses, window),
    }));
    const limit = zoom === "30" ? 30 : zoom === "60" ? 60 : candles.length;
    const start = Math.max(0, candles.length - limit);
    return {
      visibleCandles: candles.slice(start),
      sliceStart: start,
      slicedMas: fullMas.map((ma) => ({
        window: ma.window,
        values: ma.values.slice(start),
      })),
    };
  }, [candles, zoom]);

  const view = useMemo(() => {
    const innerW = Math.max(10, width - AXIS_W - PAD_LEFT);
    let low = Infinity;
    let high = -Infinity;
    let maxVolume = 0;
    for (const candle of visibleCandles) {
      low = Math.min(low, candle.low);
      high = Math.max(high, candle.high);
      maxVolume = Math.max(maxVolume, candle.volume);
    }
    for (const ma of slicedMas) {
      if (!enabledMas[ma.window]) continue;
      for (const val of ma.values) {
        if (val !== null) {
          low = Math.min(low, val);
          high = Math.max(high, val);
        }
      }
    }
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    const span = high - low || Math.max(high * 0.02, 0.01);
    const top = high + span * 0.06;
    const bottom = low - span * 0.06;
    const step = innerW / Math.max(1, visibleCandles.length);
    const bodyW = Math.max(1.2, Math.min(14, step * 0.62));
    const y = (value: number) => PAD_TOP + ((top - value) / (top - bottom)) * PRICE_H;
    const x = (index: number) => PAD_LEFT + step * (index + 0.5);

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => top - (top - bottom) * ratio);

    return { innerW, top, bottom, step, bodyW, y, x, maxVolume, ticks };
  }, [visibleCandles, slicedMas, enabledMas, width]);

  if (!view) return <ChartEmpty />;
  const { y, x, step, bodyW, maxVolume, ticks } = view;
  const activeHover = hover !== null && hover < visibleCandles.length ? hover : null;

  return (
    <div ref={ref} className="relative w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/40 p-0.5 dark:border-white/10 dark:bg-slate-800/40" role="group" aria-label="K线区间缩放">
          {ZOOM_OPTIONS.map((option) => {
            const active = zoom === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setZoom(option.key);
                  setHover(null);
                }}
                className={`rounded-full px-2.5 py-0.5 transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  active
                    ? "bg-sky-500 font-medium text-white"
                    : "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <span className="text-slate-400 tabular-nums">
          当前展示 {visibleCandles.length} / {candles.length} 根
        </span>
      </div>

      <svg
        width={width}
        height={HEIGHT}
        className="block text-slate-500 dark:text-slate-400"
        role="img"
        aria-label={`K 线图，共 ${visibleCandles.length} 根`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const index = Math.floor((event.clientX - rect.left - PAD_LEFT) / step);
          setHover(index >= 0 && index < visibleCandles.length ? index : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="candle-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.06} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>

        {ticks.map((tick, index) => {
          const lineY = y(tick);
          return (
            <g key={`tick-${index}`}>
              <line x1={PAD_LEFT} x2={width - AXIS_W} y1={lineY} y2={lineY} stroke={GRID} strokeDasharray="3 4" />
              <text x={width - AXIS_W + 8} y={lineY + 3.5} fontSize={10} fill="currentColor">
                {tick.toFixed(decimals(tick))}
              </text>
            </g>
          );
        })}

        {visibleCandles.map((candle, index) => {
          const color = candle.close >= candle.open ? UP : DOWN;
          const top = y(Math.max(candle.open, candle.close));
          const bottom = y(Math.min(candle.open, candle.close));
          return (
            <g key={`${candle.date}-${index}`}>
              <line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth={1} />
              <rect
                x={x(index) - bodyW / 2}
                y={top}
                width={bodyW}
                height={Math.max(1, bottom - top)}
                fill={color}
              />
            </g>
          );
        })}

        {slicedMas.map((ma, index) => {
          if (!enabledMas[ma.window]) return null;
          const segments: string[] = [];
          let started = false;
          ma.values.forEach((value, position) => {
            if (value === null) return;
            segments.push(`${started ? "L" : "M"}${x(position).toFixed(2)},${y(value).toFixed(2)}`);
            started = true;
          });
          if (!segments.length) return null;
          return (
            <path
              key={`ma-${ma.window}`}
              d={segments.join(" ")}
              fill="none"
              stroke={MA_COLORS[index]}
              strokeWidth={1.2}
              opacity={0.92}
            />
          );
        })}

        <line x1={PAD_LEFT} x2={width - AXIS_W} y1={PAD_TOP + PRICE_H + GAP} y2={PAD_TOP + PRICE_H + GAP} stroke={GRID} />
        {visibleCandles.map((candle, index) => {
          const height = maxVolume > 0 ? (candle.volume / maxVolume) * VOL_H : 0;
          return (
            <rect
              key={`vol-${candle.date}-${index}`}
              x={x(index) - bodyW / 2}
              y={PAD_TOP + PRICE_H + GAP + VOL_H - height}
              width={bodyW}
              height={Math.max(0.8, height)}
              fill={candle.close >= candle.open ? UP : DOWN}
              opacity={0.35}
            />
          );
        })}

        {tickIndexes(visibleCandles.length, 5).map((index) => (
          <text
            key={`x-${index}`}
            x={x(index)}
            y={HEIGHT - 4}
            fontSize={10}
            fill="currentColor"
            textAnchor={index === 0 ? "start" : index === visibleCandles.length - 1 ? "end" : "middle"}
          >
            {candleAxisLabel(visibleCandles[index].date, period)}
          </text>
        ))}

        {activeHover !== null && (
          <>
            <line
              x1={x(activeHover)}
              x2={x(activeHover)}
              y1={PAD_TOP}
              y2={PAD_TOP + PRICE_H}
              stroke="currentColor"
              strokeOpacity={0.4}
              strokeDasharray="3 3"
            />
            <circle cx={x(activeHover)} cy={y(visibleCandles[activeHover].close)} r={3} fill={MA_COLORS[2]} />
          </>
        )}
        <text
          x={PAD_LEFT + 2}
          y={PAD_TOP + PRICE_H + GAP + 9}
          fontSize={9}
          fill="currentColor"
          opacity={0.7}
        >
          量
        </text>
      </svg>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        {MA_WINDOWS.map((window, index) => {
          const active = enabledMas[window];
          const hoverVal = activeHover !== null ? slicedMas[index]?.values[activeHover] ?? null : null;
          return (
            <button
              key={window}
              type="button"
              aria-pressed={active}
              onClick={() =>
                setEnabledMas((prev) => ({
                  ...prev,
                  [window]: !prev[window],
                }))
              }
              title={active ? `点击隐藏 MA${window}` : `点击显示 MA${window}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 transition focus-visible:outline-2 focus-visible:outline-sky-500 ${
                active
                  ? "border-white/50 bg-white/60 text-slate-700 dark:border-white/15 dark:bg-slate-800/60 dark:text-slate-200"
                  : "border-transparent bg-slate-500/5 text-slate-400 opacity-55 line-through"
              }`}
            >
              <span
                className="inline-block h-1.5 w-3 rounded-full"
                style={{ backgroundColor: MA_COLORS[index] }}
              />
              <span>MA{window}</span>
              {active && hoverVal !== null && (
                <span className="tabular-nums text-[10px] text-slate-500 dark:text-slate-400">
                  {hoverVal.toFixed(decimals(hoverVal))}
                </span>
              )}
            </button>
          );
        })}
        <span className="ml-auto">柱体颜色：红涨绿跌（点击均线可开关）</span>
      </div>

      {activeHover !== null && (
        <FloatingTooltip
          left={Math.min(Math.max(8, x(activeHover) + 12), width - 190)}
          title={visibleCandles[activeHover].date}
          rows={[
            ["开", priceText(visibleCandles[activeHover].open, unit)],
            ["高", priceText(visibleCandles[activeHover].high, unit)],
            ["低", priceText(visibleCandles[activeHover].low, unit)],
            ["收", priceText(visibleCandles[activeHover].close, unit)],
            ["量", compactNumber(visibleCandles[activeHover].volume)],
            [
              "涨跌",
              (() => {
                const rawIndex = sliceStart + activeHover;
                const previous = rawIndex > 0 ? candles[rawIndex - 1].close : null;
                if (!previous) return "—";
                const pct = ((visibleCandles[activeHover].close - previous) / previous) * 100;
                return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
              })(),
            ],
          ]}
        />
      )}
    </div>
  );
}

function LineChart({
  points,
  prevClose,
  unit,
  intraday,
  digits,
}: {
  points: MarketLinePoint[];
  prevClose: number | null;
  unit: string;
  intraday: boolean;
  digits: number;
}) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const view = useMemo(() => {
    const innerW = Math.max(10, width - AXIS_W - PAD_LEFT);
    let low = Infinity;
    let high = -Infinity;
    let maxVolume = 0;
    for (const point of points) {
      low = Math.min(low, point.value, point.avg ?? point.value);
      high = Math.max(high, point.value, point.avg ?? point.value);
      maxVolume = Math.max(maxVolume, point.volume ?? 0);
    }
    if (prevClose && prevClose > 0) {
      low = Math.min(low, prevClose);
      high = Math.max(high, prevClose);
    }
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    const span = high - low || Math.max(high * 0.01, 0.01);
    const top = high + span * 0.08;
    const bottom = low - span * 0.08;
    const step = innerW / Math.max(1, points.length - 1);
    const x = (index: number) => PAD_LEFT + step * index;
    const y = (value: number) => PAD_TOP + ((top - value) / (top - bottom)) * PRICE_H;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => top - (top - bottom) * ratio);
    return { x, y, step, ticks, maxVolume, top, bottom };
  }, [points, prevClose, width]);

  if (!view) return <ChartEmpty />;
  const { x, y, step, ticks, maxVolume } = view;

  const rising = prevClose ? points[points.length - 1].value >= prevClose : true;
  const lineColor = intraday ? (rising ? UP : DOWN) : "#0284c7";
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`).join(" ");
  const area = `${path} L${x(points.length - 1)},${PAD_TOP + PRICE_H} L${x(0)},${PAD_TOP + PRICE_H} Z`;
  const avgPath = points.some((point) => point.avg !== undefined)
    ? points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.avg ?? point.value)}`).join(" ")
    : "";

  const activeHover = hover !== null && hover < points.length ? hover : null;

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={HEIGHT}
        className="block text-slate-500 dark:text-slate-400"
        role="img"
        aria-label={`走势图，共 ${points.length} 个点`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const index = Math.round((event.clientX - rect.left - PAD_LEFT) / step);
          setHover(index >= 0 && index < points.length ? index : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="line-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.28} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {ticks.map((tick, index) => (
          <g key={`tick-${index}`}>
            <line
              x1={PAD_LEFT}
              x2={width - AXIS_W}
              y1={y(tick)}
              y2={y(tick)}
              stroke={GRID}
              strokeDasharray="3 4"
            />
            <text x={width - AXIS_W + 8} y={y(tick) + 3.5} fontSize={10} fill="currentColor">
              {tick.toFixed(digits)}
            </text>
          </g>
        ))}

        {prevClose && prevClose > 0 && (
          <>
            <line
              x1={PAD_LEFT}
              x2={width - AXIS_W}
              y1={y(prevClose)}
              y2={y(prevClose)}
              stroke="currentColor"
              strokeOpacity={0.45}
              strokeDasharray="4 4"
            />
            <text x={width - AXIS_W + 8} y={y(prevClose) - 3} fontSize={9} fill="currentColor">
              昨收
            </text>
          </>
        )}

        <path d={area} fill="url(#line-area)" />
        <path d={path} fill="none" stroke={lineColor} strokeWidth={1.6} strokeLinejoin="round" />
        {avgPath && (
          <path d={avgPath} fill="none" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.9} />
        )}

        {maxVolume > 0 && (
          <>
            <line
              x1={PAD_LEFT}
              x2={width - AXIS_W}
              y1={PAD_TOP + PRICE_H + GAP}
              y2={PAD_TOP + PRICE_H + GAP}
              stroke={GRID}
            />
            {points.map((point, index) => {
              const height = maxVolume > 0 ? ((point.volume ?? 0) / maxVolume) * VOL_H : 0;
              return (
                <rect
                  key={`vol-${index}`}
                  x={x(index) - Math.max(0.6, step * 0.3)}
                  y={PAD_TOP + PRICE_H + GAP + VOL_H - height}
                  width={Math.max(1, step * 0.6)}
                  height={Math.max(0.5, height)}
                  fill={lineColor}
                  opacity={0.25}
                />
              );
            })}
          </>
        )}

        {tickIndexes(points.length, 5).map((index) => (
          <text
            key={`x-${index}`}
            x={x(index)}
            y={HEIGHT - 4}
            fontSize={10}
            fill="currentColor"
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
          >
            {intraday ? points[index].label.slice(11) || points[index].label : points[index].label.slice(5)}
          </text>
        ))}

        {activeHover !== null && (
          <>
            <line
              x1={x(activeHover)}
              x2={x(activeHover)}
              y1={PAD_TOP}
              y2={PAD_TOP + PRICE_H}
              stroke="currentColor"
              strokeOpacity={0.4}
              strokeDasharray="3 3"
            />
            <circle cx={x(activeHover)} cy={y(points[activeHover].value)} r={3} fill={lineColor} />
          </>
        )}
      </svg>

      {intraday && (
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4" style={{ backgroundColor: lineColor }} />
            价格
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-amber-500" />
            均价
          </span>
          <span className="ml-auto">虚线为昨收</span>
        </div>
      )}

      {activeHover !== null && (
        <FloatingTooltip
          left={Math.min(Math.max(8, x(activeHover) + 12), width - 190)}
          title={points[activeHover].label}
          rows={[
            ["价格", priceText(points[activeHover].value, unit, digits)],
            ...(points[activeHover].avg !== undefined
              ? ([["均价", priceText(points[activeHover].avg as number, unit, digits)]] as Array<[string, string]>)
              : []),
            ...(prevClose && prevClose > 0
              ? (() => {
                  const pct = ((points[activeHover].value - prevClose) / prevClose) * 100;
                  return [["涨跌", `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`]] as Array<[string, string]>;
                })()
              : []),
            ...(points[activeHover].volume
              ? ([["量", compactNumber(points[activeHover].volume as number)]] as Array<[string, string]>)
              : []),
          ]}
        />
      )}
    </div>
  );
}

function FloatingTooltip({
  left,
  title,
  rows,
}: {
  left: number;
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div
      className="pointer-events-none absolute top-10 z-20 w-44 rounded-lg border border-white/40 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/95"
      style={{ left }}
    >
      <p className="mb-1 font-medium text-slate-700 dark:text-slate-200">{title}</p>
      <dl className="space-y-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="tabular-nums text-slate-700 dark:text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ChartEmpty() {
  return (
    <div className="flex h-[336px] items-center justify-center rounded-xl border border-dashed border-white/40 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
      暂无行情数据
    </div>
  );
}

export default function MarketChart({
  data,
  currency,
  kind,
}: {
  data: MarketHistory;
  currency: "CNY" | "USD";
  kind: "stock" | "index" | "fund";
}) {
  // 指数是点位不是货币，tooltip 不带 ¥/$。
  const unit = kind === "index" ? "" : currency === "USD" ? "$" : "¥";
  if (data.series === "candle" && data.candles.length > 0) {
    return <CandleChart candles={data.candles} unit={unit} period={data.period} />;
  }
  if (data.points.length > 0) {
    return (
      <LineChart
        points={data.points}
        prevClose={data.prev_close}
        unit={unit}
        intraday={data.period === "intraday"}
        digits={kind === "fund" ? 4 : 2}
      />
    );
  }
  return <ChartEmpty />;
}
