import { handle } from "@/server/http/handler";
import { getMarketService } from "@/server/modules/market";

export const dynamic = "force-dynamic";

/** 公开行情（只读）：自选报价 + 指数条。持仓成本等私密信息不在这里返回。 */
export async function GET(request: Request) {
  return handle(
    async () => {
      const service = getMarketService();
      const [overview, indices] = await Promise.all([service.overview(), service.indices()]);
      return {
        items: overview.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          market: item.market,
          code: item.code,
          name: item.name,
          price: item.price,
          change: item.change,
          change_pct: item.change_pct,
          time: item.time,
          stale: item.stale,
          currency: item.currency,
        })),
        indices: indices.filter((item) => item.price > 0),
        fetched_at: overview.fetched_at,
      };
    },
    { request },
  );
}
