import { handle } from "@/server/http/handler";
import { buildDigest } from "@/server/modules/digest";

export const dynamic = "force-dynamic";

/** 每日简报：新闻、行情、NBA、收藏、账本（仅管理员登录时）。 */
export async function GET(request: Request) {
  return handle(async () => Response.json(await buildDigest(), {
    headers: { "cache-control": "private, no-store" },
  }), { request });
}
