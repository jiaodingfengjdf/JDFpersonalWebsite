import { handle } from "@/server/http/handler";
import { historyQuery } from "@/server/modules/market/contracts";
import { getMarketService } from "@/server/modules/market";

export const dynamic = "force-dynamic";

/** 单标的历史序列：分时 / 日K / 周K / 月K。公开只读，失败时降级为站内快照。 */
export async function GET(request: Request) {
  return handle(
    async () => {
      const params = new URL(request.url).searchParams;
      const query = historyQuery.parse({
        id: params.get("id") ?? "",
        period: params.get("period") ?? "day",
      });
      return getMarketService().history(query.id, query.period);
    },
    { request },
  );
}
