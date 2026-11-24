import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { alertInput } from "@/server/modules/market/contracts";
import { getMarketService } from "@/server/modules/market";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    return { items: await getMarketService().alerts() };
  }, { request });
}

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const input = alertInput.parse(await readJson(request));
      return getMarketService().createAlert(input);
    },
    { request },
  );
}
