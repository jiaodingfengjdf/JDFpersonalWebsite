import { requireAdmin } from "@/server/auth/guard";
import { handle } from "@/server/http/handler";
import { getLibraryService } from "@/server/modules/library";

export const dynamic = "force-dynamic";

/** 书架列表：后台 LibraryManager 的 GET /api/admin/library。 */
export async function GET(request: Request) {
  return handle(
    async () => {
      await requireAdmin();
      return { items: await getLibraryService().list() };
    },
    { request },
  );
}
