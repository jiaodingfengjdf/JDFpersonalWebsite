import { handle } from "@/server/http/handler";
import { searchQuery } from "@/server/modules/search/contracts";
import { searchCross } from "@/server/modules/search/cross";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

/** 跨模块搜索：收藏 / 书架 / 影视 / 游戏 / 新闻。 */
export async function GET(request: Request) {
  return handle(
    async () => {
      const { q } = searchQuery.parse({
        q: new URL(request.url).searchParams.get("q") ?? "",
      });
      return searchCross(getDb(), q);
    },
    { request },
  );
}
