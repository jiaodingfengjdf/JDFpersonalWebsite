import { getDb } from "@/server/db/client";
import { createFeedService } from "./service";

export function getFeedService() {
  return createFeedService(getDb());
}

export { createFeedService } from "./service";
export * from "./contracts";
