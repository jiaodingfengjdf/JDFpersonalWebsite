import { and, asc, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { marketSnapshot, marketWatch } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import type { MarketHistoryPoint, MarketOverview, MarketQuoteItem, WatchInput } from "./contracts";
import { getQuotes, symbolOf, type MarketKind } from "./provider";

const round2 = (value: number) => Math.round(value * 100) / 100;
const SNAPSHOT_GAP_MS = 10 * 60 * 1000;
const dateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

export function createMarketService(db: AppDatabase) {
  async function listWatches() {
    return db.select().from(marketWatch).orderBy(asc(marketWatch.sort), asc(marketWatch.id));
  }

  const watchSnapshots = (watch: { kind: string; code: string }) =>
    and(eq(marketSnapshot.kind, watch.kind), eq(marketSnapshot.code, watch.code));

  return {
    watches: listWatches,

    async quotes(options: { record?: boolean } = {}): Promise<MarketQuoteItem[]> {
      const watches = await listWatches();
      const quotes = await getQuotes(
        watches.map((item) => ({ kind: item.kind as MarketKind, code: item.code })),
      );

      const now = Date.now();
      const mapQuotes = () => watches.map((watch): MarketQuoteItem => {
        const hit = quotes.get(symbolOf(watch.kind as MarketKind, watch.code));
        const snapshot = !hit || (options.record && !hit.stale)
          ? db.select().from(marketSnapshot).where(watchSnapshots(watch))
              .orderBy(desc(marketSnapshot.capturedAt)).limit(1).get()
          : undefined;
        if (hit && !hit.stale && options.record && (!snapshot || now - snapshot.capturedAt >= SNAPSHOT_GAP_MS)) {
          db.insert(marketSnapshot).values({
            kind: watch.kind, code: watch.code, price: hit.quote.price, changePct: hit.quote.changePct, capturedAt: now,
          }).run();
        }
        const price = hit?.quote.price ?? snapshot?.price ?? 0;
        const changePct = hit?.quote.changePct ?? snapshot?.changePct ?? 0;
        const cost = watch.cost ?? null;
        const shares = watch.shares ?? null;
        const hasHolding = cost !== null && shares !== null && shares > 0;

        return {
          id: watch.id,
          kind: watch.kind as MarketQuoteItem["kind"],
          code: watch.code,
          name: hit?.quote.name || watch.name || watch.code,
          price,
          change: hit?.quote.change ?? (price > 0 && changePct > -100 ? price * changePct / (100 + changePct) : 0),
          change_pct: changePct,
          time: hit?.quote.time ?? (snapshot ? dateTime.format(snapshot.capturedAt) : ""),
          stale: hit?.stale ?? true,
          cost,
          shares,
          market_value: hasHolding && price > 0 ? round2(price * shares) : null,
          profit: hasHolding && price > 0 ? round2((price - cost) * shares) : null,
          profit_pct: hasHolding && price > 0 && cost > 0 ? round2(((price - cost) / cost) * 100) : null,
        };
      });

      return options.record ? db.transaction(mapQuotes, { behavior: "immediate" }) : mapQuotes();
    },

    async overview(): Promise<MarketOverview> {
      const items = await this.quotes({ record: true });
      const now = Date.now();
      const held = items.filter((item) => item.cost !== null && (item.shares ?? 0) > 0);
      const unpricedHoldings = held.filter((item) => item.market_value === null).length;
      const totalValue = round2(held.reduce((sum, item) => sum + (item.market_value ?? 0), 0));
      const totalCost = round2(
        held.reduce((sum, item) => sum + (item.cost ?? 0) * (item.shares ?? 0), 0),
      );

      return {
        items,
        total_value: unpricedHoldings ? null : totalValue,
        total_cost: totalCost,
        total_profit: unpricedHoldings ? null : round2(totalValue - totalCost),
        unpriced_holdings: unpricedHoldings,
        fetched_at: new Date(now).toISOString(),
      };
    },

    async history(id: number): Promise<MarketHistoryPoint[]> {
      const watch = db.select().from(marketWatch).where(eq(marketWatch.id, id)).get();
      if (!watch) throw errors.notFound("自选标的不存在");
      const rows = await db.select({ price: marketSnapshot.price, captured_at: marketSnapshot.capturedAt })
        .from(marketSnapshot)
        .where(watchSnapshots(watch))
        .orderBy(desc(marketSnapshot.capturedAt))
        .limit(120);
      return rows.reverse();
    },

    async create(input: WatchInput) {
      const now = new Date();
      const [row] = await db
        .insert(marketWatch)
        .values({
          kind: input.kind,
          code: input.code,
          name: input.name,
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
      await db
        .update(marketWatch)
        .set({
          kind: input.kind,
          code: input.code,
          name: input.name,
          cost: input.cost,
          shares: input.shares,
          sort: input.sort,
          updatedAt: new Date(),
        })
        .where(eq(marketWatch.id, id));
      return { ok: true };
    },

    async remove(id: number) {
      await db.delete(marketWatch).where(eq(marketWatch.id, id));
      return { ok: true };
    },
  };
}

export type MarketService = ReturnType<typeof createMarketService>;
