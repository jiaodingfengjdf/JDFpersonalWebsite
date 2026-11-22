import { and, asc, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { marketSnapshot, marketWatch } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import type { MarketOverview, MarketQuoteItem, WatchInput } from "./contracts";
import { getQuotes, symbolOf, type MarketKind } from "./provider";

const round2 = (value: number) => Math.round(value * 100) / 100;
const SNAPSHOT_GAP_MS = 10 * 60 * 1000;

export function createMarketService(db: AppDatabase) {
  async function listWatches() {
    return db.select().from(marketWatch).orderBy(asc(marketWatch.sort), asc(marketWatch.id));
  }

  return {
    watches: listWatches,

    async quotes(): Promise<MarketQuoteItem[]> {
      const watches = await listWatches();
      const quotes = await getQuotes(
        watches.map((item) => ({ kind: item.kind as MarketKind, code: item.code })),
      );

      const items: MarketQuoteItem[] = watches.map((watch) => {
        const hit = quotes.get(symbolOf(watch.kind as MarketKind, watch.code));
        const price = hit?.quote.price ?? 0;
        const cost = watch.cost ?? null;
        const shares = watch.shares ?? null;
        const hasHolding = cost !== null && shares !== null && shares > 0;

        return {
          id: watch.id,
          kind: watch.kind as MarketQuoteItem["kind"],
          code: watch.code,
          name: hit?.quote.name || watch.name || watch.code,
          price,
          change: hit?.quote.change ?? 0,
          change_pct: hit?.quote.changePct ?? 0,
          time: hit?.quote.time ?? "",
          stale: hit?.stale ?? true,
          cost,
          shares,
          market_value: hasHolding ? round2(price * shares) : null,
          profit: hasHolding ? round2((price - cost) * shares) : null,
          profit_pct: hasHolding && cost > 0 ? round2(((price - cost) / cost) * 100) : null,
        };
      });

      return items;
    },

    async overview(): Promise<MarketOverview> {
      const items = await this.quotes();
      const now = Date.now();
      const held = items.filter((item) => item.market_value !== null);
      const totalValue = round2(held.reduce((sum, item) => sum + (item.market_value ?? 0), 0));
      const totalCost = round2(
        held.reduce((sum, item) => sum + (item.cost ?? 0) * (item.shares ?? 0), 0),
      );

      for (const item of items) {
        if (!Number.isFinite(item.price) || item.price <= 0) continue;
        const [last] = await db
          .select({ capturedAt: marketSnapshot.capturedAt })
          .from(marketSnapshot)
          .where(and(eq(marketSnapshot.kind, item.kind), eq(marketSnapshot.code, item.code)))
          .orderBy(desc(marketSnapshot.capturedAt))
          .limit(1);
        if (last && now - last.capturedAt < SNAPSHOT_GAP_MS) continue;
        await db.insert(marketSnapshot).values({
          kind: item.kind,
          code: item.code,
          price: item.price,
          changePct: item.change_pct,
          capturedAt: now,
        });
      }

      return {
        items,
        total_value: totalValue,
        total_cost: totalCost,
        total_profit: round2(totalValue - totalCost),
        fetched_at: new Date(now).toISOString(),
      };
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
