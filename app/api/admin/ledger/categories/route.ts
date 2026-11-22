import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { categoryInput } from "@/server/modules/ledger/contracts";
import { getLedgerService } from "@/server/modules/ledger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    return getLedgerService().categories();
  }, { request });
}

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const input = categoryInput.parse(await readJson(request));
      return getLedgerService().createCategory(input);
    },
    { request },
  );
}
