import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { getLedgerService } from "@/server/modules/ledger";
import { transactionInput } from "@/server/modules/ledger/contracts";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const id = Number((await params).id);
      if (!Number.isSafeInteger(id) || id <= 0) return { ok: false };
      const input = transactionInput.parse(await readJson(request));
      return getLedgerService().updateTransaction(id, input);
    },
    { request },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const id = Number((await params).id);
      if (!Number.isSafeInteger(id) || id <= 0) return { ok: false };
      await getLedgerService().removeTransaction(id);
      return { ok: true };
    },
    { request },
  );
}
