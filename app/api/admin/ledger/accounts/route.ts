import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { accountInput } from "@/server/modules/ledger/contracts";
import { getLedgerService } from "@/server/modules/ledger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    // 后台账户列表默认显示全部（含归档）；传 includeArchived=0 只看在用的。
    const includeArchived =
      new URL(request.url).searchParams.get("includeArchived") !== "0";
    return getLedgerService().accounts({ includeArchived });
  }, { request });
}

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const input = accountInput.parse(await readJson(request));
      return getLedgerService().createAccount(input);
    },
    { request },
  );
}
