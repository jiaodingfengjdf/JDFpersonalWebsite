import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

/**
 * Shared Drizzle SQLite database type compatible with both local
 * `better-sqlite3` ("sync") and remote Turso/libSQL ("async").
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppDatabase = BaseSQLiteDatabase<"sync" | "async", any, typeof schema>;
