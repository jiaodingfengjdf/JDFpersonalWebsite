import { requireAdmin } from "@/server/auth/guard";
import { handle } from "@/server/http/handler";
import { getLedgerService } from "@/server/modules/ledger";
import { ledgerMonth } from "@/server/modules/ledger/contracts";
import { exportLedgerCsv } from "@/server/modules/ledger/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const month = ledgerMonth.parse(new URL(request.url).searchParams.get("month"));
    const { items } = await getLedgerService().transactions({ month, limit: -1, offset: 0 });
    return new Response(exportLedgerCsv(items), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="ledger-${month}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  }, { request });
}
