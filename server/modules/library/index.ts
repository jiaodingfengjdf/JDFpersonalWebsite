import { getDb } from "@/server/db/client";
import { createLibraryService } from "./service";

export function getLibraryService() {
  return createLibraryService(getDb());
}

export { createLibraryService } from "./service";
export * from "./contracts";
