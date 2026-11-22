import { getDb } from "@/server/db/client";
import { createNbaService } from "./service";

export function getNbaService() {
  return createNbaService(getDb());
}

export { createNbaService } from "./service";
export * from "./contracts";
