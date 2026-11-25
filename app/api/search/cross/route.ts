import { handle } from "@/server/http/handler";
import { enforceIpRateLimit } from "@/server/http/rate-limit";
import { searchQuery } from "@/server/modules/search/contracts";
import { searchCross } from "@/server/modules/search/cross";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

/** 跨模块搜索：收藏 / 书架 / 影视 / 游戏 / 新闻。 */
export async function GET(request: Request) {
  return handle(
    async () => {
      // 跨模块搜索同样是公开的无索引扫描，按 IP 限流：每分钟 30 次。
      enforceIpRateLimit(request, "search-cross", 30, 60_000);
      const { q } = searchQuery.parse({
        q: new URL(request.url).searchParams.get("q") ?? "",
      });
      return searchCross(getDb(), q);
    },
    { request },
  );
}
