import { getDb } from "@/server/db/client";
import { createPodcastService } from "./service";

export function getPodcastService() {
  return createPodcastService(getDb());
}

export { createPodcastService } from "./service";
export * from "./contracts";
