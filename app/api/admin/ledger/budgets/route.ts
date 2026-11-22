import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { budgetInput } from "@/server/modules/ledger/contracts";
import { getLedgerService } from "@/server/modules/ledger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const input = budgetInput.parse(await readJson(request));
      await getLedgerService().upsertBudget(input);
      return { ok: true };
    },
    { request },
  );
}
