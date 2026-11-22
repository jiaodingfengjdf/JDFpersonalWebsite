import { getDb } from "@/server/db/client";
import { createCollectionService } from "./service";

export function getCollectionService() {
  return createCollectionService(getDb());
}

export { createCollectionService } from "./service";
export * from "./contracts";
