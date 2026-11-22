import { handle } from "@/server/http/handler";
import { getMarketService } from "@/server/modules/market";

export const dynamic = "force-dynamic";

/** 公开行情（只读）：自选列表 + 报价。持仓成本等私密信息不在这里返回。 */
export async function GET(request: Request) {
  return handle(
    async () => {
      const overview = await getMarketService().overview();
      return {
        items: overview.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          code: item.code,
          name: item.name,
          price: item.price,
          change: item.change,
          change_pct: item.change_pct,
          time: item.time,
          stale: item.stale,
        })),
        fetched_at: overview.fetched_at,
      };
    },
    { request },
  );
}
