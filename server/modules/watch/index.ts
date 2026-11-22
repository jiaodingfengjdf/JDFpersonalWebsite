import { getDb } from "@/server/db/client";
import { createWatchService } from "./service";

export function getWatchService() {
  return createWatchService(getDb());
}

export { createWatchService } from "./service";
export * from "./contracts";
