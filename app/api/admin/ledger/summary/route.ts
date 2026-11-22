import { requireAdmin } from "@/server/auth/guard";
import { handle } from "@/server/http/handler";
import { currentMonth, getLedgerService } from "@/server/modules/ledger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(
    async () => {
      await requireAdmin();
      const month = new URL(request.url).searchParams.get("month") || currentMonth();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return { error: "月份格式应为 YYYY-MM" };
      }
      return getLedgerService().summary(month);
    },
    { request },
  );
}
