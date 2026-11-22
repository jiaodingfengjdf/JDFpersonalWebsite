import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { sourceInput } from "@/server/modules/feed/contracts";
import { getFeedService } from "@/server/modules/feed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    return getFeedService().sources();
  }, { request });
}

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const input = sourceInput.parse(await readJson(request));
      return getFeedService().createSource(input);
    },
    { request },
  );
}
