import { requireAdmin } from "@/server/auth/guard";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { getFeedService } from "@/server/modules/feed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      return getFeedService().refresh();
    },
    { request },
  );
}
