import { requireAdmin } from "@/server/auth/guard";
import { readJson } from "@/server/http/body";
import { handle } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/origin";
import { assertWritable } from "@/server/http/write-guard";
import { importInput } from "@/server/modules/ledger/contracts";
import { getLedgerService } from "@/server/modules/ledger";
import { parseLedgerCsv } from "@/server/modules/ledger/csv";
import { z } from "zod";

export const dynamic = "force-dynamic";

const csvInput = z.object({
  csv: z.string().min(1).max(512 * 1024),
  account_id: z.number().int().positive(),
});

export async function POST(request: Request) {
  return handle(
    async () => {
      assertWritable();
      assertSameOrigin(request);
      await requireAdmin();
      const input = await readJson(request);
      if (input && typeof input === "object" && "csv" in input) {
        const parsed = csvInput.parse(input);
        const service = getLedgerService();
        const [accounts, categories] = await Promise.all([
          service.accounts({ includeArchived: true }),
          service.categories(),
        ]);
        return service.importTransactions(
          parseLedgerCsv(parsed.csv, parsed.account_id, { accounts, categories }),
        );
      }
      const { rows } = importInput.parse(input);
      return getLedgerService().importTransactions(rows);
    },
    { request },
  );
}
