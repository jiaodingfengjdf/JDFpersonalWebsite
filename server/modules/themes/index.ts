import { getDb } from "@/server/db/client";
import { createThemesService } from "./service";

export function getThemesService() {
  return createThemesService(getDb());
}

export { createThemesService } from "./service";
export * from "./contracts";
