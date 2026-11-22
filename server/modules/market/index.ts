import { getDb } from "@/server/db/client";
import { createMarketService } from "./service";

export function getMarketService() {
  return createMarketService(getDb());
}

export { createMarketService } from "./service";
export { symbolOf } from "./provider";
export * from "./contracts";
