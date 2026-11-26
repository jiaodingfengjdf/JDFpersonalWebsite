import { and, asc, desc, eq } from "drizzle-orm";
import { runTransaction } from "@/server/db/tx";
import type { AppDatabase } from "@/server/db/types";
import { marketAlert, marketSnapshot, marketWatch } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import type {
  AlertInput,
  MarketAlertItem,
  MarketCurrencyTotals,
  MarketHistory,
  MarketIndexItem,
  MarketOverview,
  MarketPeriod,
  MarketQuoteItem,
  WatchInput,
} from "./contracts";
import { getQuotes, symbolOf, type MarketKind } from "./provider";
import {
  cnSecid,
  dailyKline,
  fundNav,
  GLOBAL_INDICES,
  intradayTrends,
  quotesBySecids,
  resolveUsSecid,
  searchMarketSymbols,
  type EmQuote,
} from "./eastmoney";
import { aggregateCandles, aggregateNav, SERIES_LIMIT, takeLast, toCandle } from "./series";

const round2 = (value: number) => Math.round(value * 100) / 100;
const SNAPSHOT_GAP_MS = 10 * 60 * 1000;
const dateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

type WatchRow = typeof marketWatch.$inferSelect;

interface LiveQuote {
  price: number;
  change: number;
  changePct: number;
  time: string;
  stale: boolean;
  name?: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
  volume?: number | null;
  amount?: number | null;
  amplitude?: number | null;
  turnoverRate?: number | null;
  pe?: number | null;
  pb?: number | null;
  marketCap?: number | null;
}

/** 存量记录的 secid 为空，按代码推导；美股必须有 secid 才能取数。 */
function watchSecid(watch: WatchRow): string {
  if (watch.secid) return watch.secid;
  if (watch.market === "us") return "";
  return cnSecid(watch.kind, watch.code);
}

/**
 * 所有指数（全局条 + 自选里 kind=index 的 A 股/美股指数）只走东财批量报价。
 * 快照按当前 secid 集合缓存：overview 与 indices 命中同一键时拿到同一份 Map，
 * 顶部指数条与自选列表里的同一指数因此不会出现两个价格或两套 stale 标记。
 */
const INDEX_SNAPSHOT_TTL = 45_000;

type IndexQuotes = { quotes: Map<string, EmQuote>; stale: boolean };

let indexSnapshot: (IndexQuotes & { key: string; at: number }) | null = null;
let indexPending: { key: string; promise: Promise<IndexQuotes> } | null = null;

async function loadIndexQuotes(watches: WatchRow[]): Promise<IndexQuotes> {
  const secids = [
    ...new Set([
      ...GLOBAL_INDICES.map((item) => item.secid),
      ...watches
        .filter((watch) => watch.kind === "index")
        .map(watchSecid)
        .filter((secid) => secid.length > 0),
    ]),
  ].sort();
  const key = secids.join(",");
  const now = Date.now();
  if (indexSnapshot && indexSnapshot.key === key && now - indexSnapshot.at <= INDEX_SNAPSHOT_TTL) {
    return { quotes: indexSnapshot.quotes, stale: indexSnapshot.stale };
  }
  // overview() 与 indices() 在页面里是并行的，必须连 in-flight 请求也合并。
  if (indexPending && indexPending.key === key) return indexPending.promise;

  const promise = (async () => {
    const result = await quotesBySecids(secids);
    indexSnapshot = { ...result, key, at: Date.now() };
    return result;
  })();
  indexPending = { key, promise };
  try {
    return await promise;
  } finally {
    if (indexPending?.promise === promise) indexPending = null;
  }
}

export function createMarketService(db: AppDatabase) {
  async function listWatches() {
    return db.select().from(marketWatch).orderBy(asc(marketWatch.sort), asc(marketWatch.id));
  }

  const watchSnapshots = (watch: { kind: string; code: string }) =>
    and(eq(marketSnapshot.kind, watch.kind), eq(marketSnapshot.code, watch.code));

  async function lastSnapshot(watch: WatchRow, client: AppDatabase = db) {
    const [row] = await client
      .select({
        price: marketSnapshot.price,
        changePct: marketSnapshot.changePct,
        capturedAt: marketSnapshot.capturedAt,
      })
      .from(marketSnapshot)
      .where(watchSnapshots(watch))
      .orderBy(desc(marketSnapshot.capturedAt))
      .limit(1);
    return row;
  }

  async function buildItem(
    watch: WatchRow,
    live: LiveQuote | undefined,
    record: boolean,
    client: AppDatabase = db,
  ): Promise<MarketQuoteItem> {
    const snapshot = !live || live.price <= 0 ? await lastSnapshot(watch, client) : undefined;
    const now = Date.now();

    if (live && live.price > 0 && !live.stale && record) {
      const previous = await lastSnapshot(watch, client);
      if (!previous || now - previous.capturedAt >= SNAPSHOT_GAP_MS) {
        await client.insert(marketSnapshot).values({
          kind: watch.kind,
          code: watch.code,
          price: live.price,
          changePct: live.changePct,
          capturedAt: now,
        });
      }
    }

    const price = live?.price ?? snapshot?.price ?? 0;
    const changePct = live?.price ? live.changePct : (snapshot?.changePct ?? 0);
    const cost = watch.cost ?? null;
    const shares = watch.shares ?? null;
    const hasHolding = cost !== null && shares !== null && shares > 0;
    const currency = watch.market === "us" ? "USD" : "CNY";

    return {
      id: watch.id,
      kind: watch.kind as MarketQuoteItem["kind"],
      market: watch.market === "us" ? "us" : "cn",
      code: watch.code,
      name: live?.name || watch.name || watch.code,
      price,
      change: live?.price ? live.change : 0,
      change_pct: price > 0 ? changePct : 0,
      time: live?.time || (snapshot ? dateTime.format(snapshot.capturedAt) : ""),
      stale: live ? live.stale : true,
      currency,
      sort: watch.sort,
      cost,
      shares,
      market_value: hasHolding && price > 0 ? round2(price * shares) : null,
      profit: hasHolding && price > 0 ? round2((price - cost) * shares) : null,
      profit_pct: hasHolding && price > 0 && cost > 0 ? round2(((price - cost) / cost) * 100) : null,
      open: live?.open ?? null,
      high: live?.high ?? null,
      low: live?.low ?? null,
      prev_close: live?.prevClose ?? null,
      volume: live?.volume ?? null,
      amount: live?.amount ?? null,
      amplitude: live?.amplitude ?? null,
      turnover_rate: live?.turnoverRate ?? null,
      pe: live?.pe ?? null,
      pb: live?.pb ?? null,
      market_cap: live?.marketCap ?? null,
    };
  }

  /** 美股走搜索接口校验代码并补全名称；A 股直接按规则推导 secid。 */
  async function resolveIdentity(
    input: WatchInput,
  ): Promise<{ market: "cn" | "us"; kind: "stock" | "index" | "fund"; secid: string; name: string }> {
    if (input.market === "us") {
      const hit = await resolveUsSecid(input.code);
      if (!hit) {
        throw errors.badRequest(`没有找到美股标的「${input.code}」，请填交易所代码，例如 AAPL / SPX`);
      }
      return { market: "us", kind: hit.kind, secid: hit.secid, name: hit.name };
    }
    return {
      market: "cn",
      kind: input.kind,
      secid: cnSecid(input.kind, input.code),
      name: input.name,
    };
  }

  return {
    watches: listWatches,

    async quotes(options: { record?: boolean } = {}): Promise<MarketQuoteItem[]> {
      const watches = await listWatches();
      if (watches.length === 0) return [];

      // 指数统一走东财，与 GLOBAL_INDICES 合并成一批；腾讯只取 A 股个股与基金。
      const indexWatches = watches.filter((watch) => watch.kind === "index");
      const cnWatches = watches.filter(
        (watch) => watch.market !== "us" && watch.kind !== "index",
      );
      const usWatches = watches.filter(
        (watch) => watch.market === "us" && watch.kind !== "index",
      );
      const usSecids = usWatches.map(watchSecid).filter((secid) => secid.length > 0);

      const [cnQuotes, indexResult, usResult] = await Promise.all([
        getQuotes(cnWatches.map((watch) => ({ kind: watch.kind as MarketKind, code: watch.code }))),
        loadIndexQuotes(indexWatches),
        quotesBySecids(usSecids),
      ]);

      const record = options.record === true;
      const build = async (client: AppDatabase): Promise<MarketQuoteItem[]> => {
        const result: MarketQuoteItem[] = [];
        for (const watch of watches) {
          // 指数优先：美股指数也必须走东财，不能被后下的美股分支截走。
          if (watch.kind === "index") {
            const hit = indexResult.quotes.get(watchSecid(watch));
            result.push(
              await buildItem(
                watch,
                hit
                  ? {
                      price: hit.price,
                      change: hit.change,
                      changePct: hit.changePct,
                      time: hit.updatedAt ? dateTime.format(hit.updatedAt) : "",
                      stale: indexResult.stale,
                      name: hit.name,
                      open: hit.open,
                      high: hit.high,
                      low: hit.low,
                      prevClose: hit.prevClose > 0 ? hit.prevClose : null,
                      volume: hit.volume,
                      amount: hit.amount,
                      amplitude: hit.amplitude,
                      turnoverRate: hit.turnoverRate,
                      pe: hit.pe,
                      pb: hit.pb,
                      marketCap: hit.marketCap,
                    }
                  : undefined,
                record,
                client,
              ),
            );
            continue;
          }

          if (watch.market === "us") {
            const hit = usResult.quotes.get(watchSecid(watch));
            result.push(
              await buildItem(
                watch,
                hit
                  ? {
                      price: hit.price,
                      change: hit.change,
                      changePct: hit.changePct,
                      time: hit.updatedAt ? dateTime.format(hit.updatedAt) : "",
                      stale: usResult.stale,
                      name: hit.name,
                      open: hit.open,
                      high: hit.high,
                      low: hit.low,
                      prevClose: hit.prevClose > 0 ? hit.prevClose : null,
                      volume: hit.volume,
                      amount: hit.amount,
                      amplitude: hit.amplitude,
                      turnoverRate: hit.turnoverRate,
                      pe: hit.pe,
                      pb: hit.pb,
                      marketCap: hit.marketCap,
                    }
                  : undefined,
                record,
                client,
              ),
            );
            continue;
          }

          const hit = cnQuotes.get(symbolOf(watch.kind as MarketKind, watch.code));
          result.push(
            await buildItem(
              watch,
              hit
                ? {
                    price: hit.quote.price,
                    change: hit.quote.change,
                    changePct: hit.quote.changePct,
                    time: hit.quote.time,
                    stale: hit.stale,
                    name: hit.quote.name,
                    open: hit.quote.open,
                    high: hit.quote.high,
                    low: hit.quote.low,
                    prevClose: hit.quote.prevClose,
                    volume: hit.quote.volume,
                    amount: hit.quote.amount,
                    amplitude: hit.quote.amplitude,
                    turnoverRate: hit.quote.turnoverRate,
                    pe: hit.quote.pe,
                    pb: hit.quote.pb,
                    marketCap: hit.quote.marketCap,
                  }
                : undefined,
              record,
              client,
            ),
          );
        }
        return result;
      };

      return record
        ? runTransaction(db, (tx) => build(tx), { behavior: "immediate" })
        : build(db);
    },

    async overview(options: { record?: boolean } = {}): Promise<MarketOverview> {
      const items = await this.quotes({ record: options.record ?? false });
      const totals: MarketCurrencyTotals[] = (["CNY", "USD"] as const)
        .map((currency) => {
          const held = items.filter(
            (item) => item.currency === currency && item.cost !== null && (item.shares ?? 0) > 0,
          );
          if (held.length === 0) return null;
          const unpriced = held.filter((item) => item.market_value === null).length;
          const value = round2(held.reduce((sum, item) => sum + (item.market_value ?? 0), 0));
          const cost = round2(
            held.reduce((sum, item) => sum + (item.cost ?? 0) * (item.shares ?? 0), 0),
          );
          return {
            currency,
            value: unpriced ? null : value,
            cost,
            profit: unpriced ? null : round2(value - cost),
            unpriced,
          } satisfies MarketCurrencyTotals;
        })
        .filter((item): item is MarketCurrencyTotals => item !== null);

      const cny = totals.find((item) => item.currency === "CNY");

      return {
        items,
        totals,
        total_value: cny?.value ?? null,
        total_cost: cny?.cost ?? 0,
        total_profit: cny?.profit ?? null,
        unpriced_holdings: cny?.unpriced ?? 0,
        fetched_at: new Date().toISOString(),
      };
    },

    /** 顶部指数条：固定 A 股 + 港股 + 美股核心指数，与自选指数共用同一批快照。 */
    async indices(): Promise<MarketIndexItem[]> {
      const watches = await listWatches();
      const { quotes, stale } = await loadIndexQuotes(watches);
      return GLOBAL_INDICES.map((meta) => {
        const hit = quotes.get(meta.secid);
        return {
          code: meta.code,
          name: meta.name,
          market: meta.market,
          price: hit?.price ?? 0,
          change: hit?.change ?? 0,
          change_pct: hit?.changePct ?? 0,
          stale: !hit || stale,
          open: hit?.open ?? null,
          high: hit?.high ?? null,
          low: hit?.low ?? null,
          amount: hit?.amount ?? null,
          amplitude: hit?.amplitude ?? null,
        };
      });
    },

    async search(query: string) {
      const [candidates, watches] = await Promise.all([
        searchMarketSymbols(query),
        listWatches(),
      ]);
      const watchMap = new Map(watches.map((w) => [`${w.kind}:${w.code}`, w.id]));
      return candidates.map((item) => ({
        ...item,
        watch_id: watchMap.get(`${item.kind}:${item.code}`) ?? null,
      }));
    },

    async history(id: number, period: MarketPeriod): Promise<MarketHistory> {
      const [watch] = await db.select().from(marketWatch).where(eq(marketWatch.id, id)).limit(1);
      if (!watch) throw errors.notFound("自选标的不存在");

      const updatedAt = new Date().toISOString();
      const fallback = async (note: string): Promise<MarketHistory> => {
        const rows = (
          await db
            .select({ price: marketSnapshot.price, capturedAt: marketSnapshot.capturedAt })
            .from(marketSnapshot)
            .where(watchSnapshots(watch))
            .orderBy(desc(marketSnapshot.capturedAt))
            .limit(120)
        ).reverse();
        return {
          period,
          series: "line",
          candles: [],
          points: rows.map((row) => ({
            label: dateTime.format(row.capturedAt),
            value: row.price,
          })),
          prev_close: rows.length > 1 ? rows[rows.length - 2].price : null,
          source: "snapshot",
          stale: true,
          note,
          updated_at: updatedAt,
        };
      };

      if (watch.kind === "fund") {
        if (period === "intraday") {
          return {
            period,
            series: "line",
            candles: [],
            points: [],
            prev_close: null,
            source: "fund",
            stale: false,
            note: "基金按日披露净值，没有分时行情；切到日K/周K/月K 查看净值走势。",
            updated_at: updatedAt,
          };
        }
        const { points, stale } = await fundNav(watch.code);
        if (points.length > 0) {
          const series = takeLast(aggregateNav(points, period), SERIES_LIMIT[period]);
          return {
            period,
            series: "line",
            candles: [],
            points: series,
            prev_close: series.length > 1 ? series[series.length - 2].value : null,
            source: "fund",
            stale,
            note: "数据来自基金历史净值（单位净值，按日披露）。",
            updated_at: updatedAt,
          };
        }
        return fallback("基金净值接口暂时不可用，先展示站内报价快照。");
      }

      const secid = watchSecid(watch);
      if (!secid) return fallback("这个标的缺少 secid，无法取历史行情。");

      if (period === "intraday") {
        const { series, stale } = await intradayTrends(secid, 1);
        if (series) {
          return {
            period,
            series: "line",
            candles: [],
            points: series.points.map((point) => ({
              label: point.time,
              value: point.price,
              avg: point.avg,
              volume: point.volume,
            })),
            prev_close: series.prevClose || null,
            source: "eastmoney",
            stale,
            note: "分时为一分钟粒度，价格为上游最新成交价；时间统一按北京时间（美股为 22:30 至次日 05:00 左右）。",
            updated_at: updatedAt,
          };
        }
        return fallback("分时接口暂时不可用，先展示站内报价快照。");
      }

      const { bars, stale } = await dailyKline(secid, 480);
      if (bars.length > 0) {
        const candles =
          period === "day" ? bars.map(toCandle) : aggregateCandles(bars, period);
        const series = takeLast(candles, SERIES_LIMIT[period]);
        return {
          period,
          series: "candle",
          candles: series,
          points: [],
          prev_close: series.length > 1 ? series[series.length - 2].close : null,
          source: "eastmoney",
          stale,
          note:
            period === "week" || period === "month"
              ? "周/月线由日线按自然周/自然月聚合：开=首日开，收=末日收，高/低=区间极值。"
              : "日线为前复权数据。",
          updated_at: updatedAt,
        };
      }
      return fallback("K 线接口暂时不可用，先展示站内报价快照。");
    },

    async create(input: WatchInput) {
      const identity = await resolveIdentity(input);
      const now = new Date();
      const [row] = await db
        .insert(marketWatch)
        .values({
          market: identity.market,
          kind: identity.kind,
          code: input.code,
          secid: identity.secid,
          name: input.name || identity.name,
          cost: input.cost,
          shares: input.shares,
          sort: input.sort,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: marketWatch.id });
      if (!row) throw errors.badRequest("这个标的已经在自选里了");
      return { id: row.id };
    },

    async update(id: number, input: WatchInput) {
      const [existing] = await db.select().from(marketWatch).where(eq(marketWatch.id, id)).limit(1);
      if (!existing) throw errors.notFound("自选标的不存在");
      const identity = await resolveIdentity(input);
      await db
        .update(marketWatch)
        .set({
          market: identity.market,
          kind: identity.kind,
          code: input.code,
          secid: identity.secid,
          name: input.name || identity.name || existing.name,
          cost: input.cost,
          shares: input.shares,
          sort: input.sort,
          updatedAt: new Date(),
        })
        .where(eq(marketWatch.id, id));
      return { ok: true };
    },

    async remove(id: number) {
      await runTransaction(
        db,
        async (tx) => {
          await tx.delete(marketAlert).where(eq(marketAlert.watchId, id));
          await tx.delete(marketWatch).where(eq(marketWatch.id, id));
        },
        { behavior: "immediate" },
      );
      return { ok: true };
    },

    async alerts(): Promise<MarketAlertItem[]> {
      const rows = await db
        .select({
          id: marketAlert.id,
          watchId: marketAlert.watchId,
          rule: marketAlert.rule,
          threshold: marketAlert.threshold,
          enabled: marketAlert.enabled,
          lastFiredAt: marketAlert.lastFiredAt,
          name: marketWatch.name,
          code: marketWatch.code,
          kind: marketWatch.kind,
        })
        .from(marketAlert)
        .innerJoin(marketWatch, eq(marketWatch.id, marketAlert.watchId))
        .orderBy(asc(marketWatch.sort), asc(marketAlert.id));

      return rows.map((row) => ({
        id: row.id,
        watch_id: row.watchId,
        name: row.name || row.code,
        code: row.code,
        kind: row.kind as MarketAlertItem["kind"],
        rule: row.rule as MarketAlertItem["rule"],
        threshold: row.threshold,
        enabled: row.enabled === true,
        last_fired_at: row.lastFiredAt ? row.lastFiredAt.toISOString() : null,
      }));
    },

    async createAlert(input: AlertInput) {
      const [watch] = await db
        .select({ id: marketWatch.id })
        .from(marketWatch)
        .where(eq(marketWatch.id, input.watch_id))
        .limit(1);
      if (!watch) throw errors.badRequest("自选标的不存在，先添加标的再加提醒");
      const now = new Date();
      const [row] = await db
        .insert(marketAlert)
        .values({
          watchId: input.watch_id,
          rule: input.rule,
          threshold: input.threshold,
          enabled: input.enabled,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: marketAlert.id });
      return { id: row.id };
    },

    async updateAlert(
      id: number,
      input: { rule: MarketAlertItem["rule"]; threshold: number; enabled: boolean },
    ) {
      const [existing] = await db
        .select()
        .from(marketAlert)
        .where(eq(marketAlert.id, id))
        .limit(1);
      if (!existing) throw errors.notFound("提醒规则不存在");
      await db
        .update(marketAlert)
        .set({
          rule: input.rule,
          threshold: input.threshold,
          enabled: input.enabled,
          updatedAt: new Date(),
        })
        .where(eq(marketAlert.id, id));
      return { ok: true };
    },

    async removeAlert(id: number) {
      await db.delete(marketAlert).where(eq(marketAlert.id, id));
      return { ok: true };
    },

    /** 记录成功推送时间，供单条规则冷却使用。 */
    async markAlertFired(id: number) {
      await db
        .update(marketAlert)
        .set({ lastFiredAt: new Date(), updatedAt: new Date() })
        .where(eq(marketAlert.id, id));
    },
  };
}

export type MarketService = ReturnType<typeof createMarketService>;
