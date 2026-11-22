import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { watchInput } from "@/server/modules/market/contracts";
import { getMarketService } from "@/server/modules/market";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    return getMarketService().overview();
  }, { request });
}

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const input = watchInput.parse(await readJson(request));
      return getMarketService().create(input);
    },
    { request },
  );
}
