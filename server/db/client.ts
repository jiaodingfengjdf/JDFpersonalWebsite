import "server-only";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { createClient, type Client as LibsqlClient } from "@libsql/client/http";
import { drizzle as drizzleBetterSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { env } from "@/server/env";
import { openDatabase } from "./open";
import * as schema from "./schema";
import type { AppDatabase } from "./types";

const globalForDb = globalThis as unknown as {
  __kiramekuSqlite?: Database.Database;
  __kiramekuLibsql?: LibsqlClient;
  __kiramekuDrizzle?: AppDatabase;
};

let sqliteInstance: Database.Database | undefined;
let libsqlInstance: LibsqlClient | undefined;
let drizzleInstance: AppDatabase | undefined;

export function isTursoConfigured(): boolean {
  return Boolean(env.TURSO_DATABASE_URL);
}

function openLocalSqlite(): Database.Database {
  const file = path.resolve(env.DATABASE_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return openDatabase(file);
}

/**
 * Normalize `libsql://` URLs to `https://` for the pure-JS HTTP client on
 * serverless runtimes (such as Vercel Functions).
 */
export function normalizeTursoHttpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("libsql://")) {
    return `https://${trimmed.slice("libsql://".length)}`;
  }
  return trimmed;
}

export function getLibsqlClient(): LibsqlClient {
  if (!env.TURSO_DATABASE_URL) {
    throw new Error("TURSO_DATABASE_URL is not configured");
  }
  if (globalForDb.__kiramekuLibsql) return globalForDb.__kiramekuLibsql;
  if (!libsqlInstance) {
    libsqlInstance = createClient({
      url: normalizeTursoHttpUrl(env.TURSO_DATABASE_URL),
      authToken: env.TURSO_AUTH_TOKEN,
    });
  }
  if (env.NODE_ENV !== "production") globalForDb.__kiramekuLibsql = libsqlInstance;
  return libsqlInstance;
}

/**
 * The connection is created on first use, not at module import time. This keeps
 * `next build` working in environments where the production data volume is not
 * mounted yet and lets read-only pages build without touching SQLite.
 */
export function getSqlite(): Database.Database {
  if (globalForDb.__kiramekuSqlite) return globalForDb.__kiramekuSqlite;
  if (!sqliteInstance) sqliteInstance = openLocalSqlite();
  if (env.NODE_ENV !== "production") globalForDb.__kiramekuSqlite = sqliteInstance;
  return sqliteInstance;
}

export function getDb(): AppDatabase {
  if (globalForDb.__kiramekuDrizzle) return globalForDb.__kiramekuDrizzle;
  if (!drizzleInstance) {
    drizzleInstance = isTursoConfigured()
      ? (drizzleLibsql(getLibsqlClient(), { schema }) as unknown as AppDatabase)
      : (drizzleBetterSqlite(getSqlite(), { schema }) as unknown as AppDatabase);
  }
  if (env.NODE_ENV !== "production") globalForDb.__kiramekuDrizzle = drizzleInstance;
  return drizzleInstance;
}
