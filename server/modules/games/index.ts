import { getDb } from "@/server/db/client";
import { createGamesService } from "./service";

export function getGamesService() {
  return createGamesService(getDb());
}

export { createGamesService } from "./service";
export * from "./contracts";
