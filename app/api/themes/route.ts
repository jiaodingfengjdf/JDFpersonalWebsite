import { handle } from "@/server/http/handler";
import { getThemesService } from "@/server/modules/themes";

export const dynamic = "force-dynamic";

/** 前台读取主题预设：站点默认（active）+ 全部可选项。 */
export async function GET(request: Request) {
  return handle(async () => getThemesService().listPublic(), { request });
}
