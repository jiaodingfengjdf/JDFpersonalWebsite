import type { AppDatabase } from "./types";

interface BetterSqliteClientLike {
  inTransaction?: boolean;
  exec?: (sql: string) => unknown;
}

function getSyncClient(db: AppDatabase): BetterSqliteClientLike | null {
  const candidate = (db as unknown as { $client?: BetterSqliteClientLike }).$client;
  if (candidate && typeof candidate.exec === "function") {
    return candidate;
  }
  return null;
}

/**
 * Execute an async transactional callback across both local `better-sqlite3`
 * and remote Turso/libSQL databases.
 */
export async function runTransaction<T>(
  db: AppDatabase,
  fn: (tx: AppDatabase) => Promise<T>,
  options?: { behavior?: "deferred" | "immediate" | "exclusive" },
): Promise<T> {
  const syncClient = getSyncClient(db);
  if (syncClient?.exec) {
    const nested = syncClient.inTransaction === true;
    const savepoint = nested
      ? `sp_${Math.random().toString(36).slice(2, 10)}`
      : null;
    const begin = savepoint
      ? `SAVEPOINT ${savepoint}`
      : options?.behavior === "immediate"
        ? "BEGIN IMMEDIATE"
        : options?.behavior === "exclusive"
          ? "BEGIN EXCLUSIVE"
          : "BEGIN";

    syncClient.exec(begin);
    try {
      const result = await fn(db);
      syncClient.exec(savepoint ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
      return result;
    } catch (error) {
      try {
        syncClient.exec(
          savepoint ? `ROLLBACK TO SAVEPOINT ${savepoint}` : "ROLLBACK",
        );
        if (savepoint) syncClient.exec(`RELEASE SAVEPOINT ${savepoint}`);
      } catch {
        // Ignore secondary rollback errors
      }
      throw error;
    }
  }

  const asyncDb = db as unknown as {
    transaction: <R>(
      cb: (tx: AppDatabase) => Promise<R>,
      config?: { behavior?: "deferred" | "immediate" | "exclusive" },
    ) => Promise<R>;
  };
  return asyncDb.transaction(fn, options);
}
