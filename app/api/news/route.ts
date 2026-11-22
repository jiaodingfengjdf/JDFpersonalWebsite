import { handle } from "@/server/http/handler";
import { itemQuery } from "@/server/modules/feed/contracts";
import { getFeedService } from "@/server/modules/feed";

export const dynamic = "force-dynamic";

/** 公开新闻列表（只读）。已读/星标是个人状态，由管理端接口修改。 */
export async function GET(request: Request) {
  return handle(
    async () => {
      const params = itemQuery.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      const items = await getFeedService().list(params);
      return { items };
    },
    { request },
  );
}
