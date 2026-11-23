import { handle } from "@/server/http/handler";
import { itemQuery } from "@/server/modules/feed/contracts";
import { getFeedService } from "@/server/modules/feed";
import { getAdminSession } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

/** 公开新闻列表（只读）。已读/星标是个人状态，由管理端接口修改。 */
export async function GET(request: Request) {
  return handle(
    async () => {
      const params = itemQuery.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      const admin = await getAdminSession();
      const items = await getFeedService().list(admin ? params : { category: params.category, limit: params.limit });
      return Response.json({ items: admin ? items : items.map((item) => ({ ...item, read: false, starred: false })) }, {
        headers: { "cache-control": "private, no-store" },
      });
    },
    { request },
  );
}
