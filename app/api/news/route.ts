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
      // 已读/星标是个人状态：未登录访客的过滤条件直接忽略，返回值也屏蔽。
      const page = await getFeedService().listPage(
        admin
          ? params
          : { category: params.category, offset: params.offset, limit: params.limit },
      );
      return Response.json(
        {
          ...page,
          items: admin
            ? page.items
            : page.items.map((item) => ({ ...item, read: false, starred: false })),
        },
        { headers: { "cache-control": "private, no-store" } },
      );
    },
    { request },
  );
}
