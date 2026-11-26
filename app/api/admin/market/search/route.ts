import { z } from "zod";
import { requireAdmin } from "@/server/auth/guard";
import { handle } from "@/server/http/handler";
import { getMarketService } from "@/server/modules/market";

export const dynamic = "force-dynamic";

const searchQuery = z.object({
  q: z.string().trim().min(1, "请输入代码或名称").max(40),
});

export async function GET(request: Request) {
  return handle(
    async () => {
      await requireAdmin();
      const { q } = searchQuery.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return { items: await getMarketService().search(q) };
    },
    { request },
  );
}
