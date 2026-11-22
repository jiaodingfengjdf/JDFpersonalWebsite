import { getDb } from "@/server/db/client";
import { createLedgerService } from "./service";

export function getLedgerService() {
  return createLedgerService(getDb());
}

export { createLedgerService, currentMonth, monthRange } from "./service";
export * from "./contracts";
