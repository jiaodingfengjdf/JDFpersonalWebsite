import { requireAdmin } from "@/server/auth/guard";
import { handle } from "@/server/http/handler";
import { currentMonth, getLedgerService } from "@/server/modules/ledger";
import { ledgerMonth } from "@/server/modules/ledger/contracts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(
    async () => {
      await requireAdmin();
      const month = ledgerMonth.parse(new URL(request.url).searchParams.get("month") || currentMonth());
      return getLedgerService().summary(month);
    },
    { request },
  );
}
