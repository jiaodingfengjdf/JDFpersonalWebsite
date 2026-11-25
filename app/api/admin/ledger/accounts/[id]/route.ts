import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { errors } from "@/server/http/errors";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { getLedgerService } from "@/server/modules/ledger";
import { accountInput } from "@/server/modules/ledger/contracts";

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
      if (!Number.isSafeInteger(id) || id <= 0) throw errors.badRequest("账户 ID 无效");
      const input = accountInput.parse(await readJson(request));
      return getLedgerService().updateAccount(id, input);
    },
    { request },
  );
}
