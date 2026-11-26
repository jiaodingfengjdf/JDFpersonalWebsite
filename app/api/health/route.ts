import fs from "node:fs";
import { getLibsqlClient, getSqlite } from "@/server/db/client";
import { env } from "@/server/env";
import { handle } from "@/server/http/handler";

const authConfigured = Boolean(
  env.AUTH_SECRET && env.AUTH_SECRET.length >= 32,
);

function databaseSize(): number | null {
  if (env.TURSO_DATABASE_URL) return null;
  try {
    return fs.statSync(env.DATABASE_PATH).size;
  } catch {
    return null;
  }
}

async function checkDatabase(): Promise<{
  ok: boolean;
  migration: string | null;
}> {
  if (env.TURSO_DATABASE_URL) {
    const client = getLibsqlClient();
    const ping = await client.execute("SELECT 1 AS ok");
    const okValue = Number(ping.rows[0]?.ok ?? ping.rows[0]?.[0] ?? 0);
    let migrationName: string | null = null;
    try {
      const mig = await client.execute(
        'SELECT "filename" FROM "__migrations" ORDER BY "applied_at" DESC, "filename" DESC LIMIT 1',
      );
      const val = mig.rows[0]?.filename ?? mig.rows[0]?.[0];
      migrationName = typeof val === "string" ? val : null;
    } catch {
      migrationName = null;
    }
    return { ok: okValue === 1, migration: migrationName };
  }

  const sqlite = getSqlite();
  const row = sqlite.prepare("SELECT 1 AS ok").get() as
    | { ok: number }
    | undefined;
  const migration = sqlite
    .prepare(
      'SELECT "filename" FROM "__migrations" ORDER BY "applied_at" DESC, "filename" DESC LIMIT 1',
    )
    .get() as { filename: string } | undefined;
  return {
    ok: row?.ok === 1,
    migration: migration?.filename ?? null,
  };
}

export async function GET(request: Request) {
  return handle(
    async () => {
      try {
        const status = await checkDatabase();

        return Response.json(
          {
            ok: status.ok,
            db: "ok",
            migration: status.migration,
            auth: authConfigured ? "ok" : "missing",
            version: "0.1.0",
            uptime_s: Math.round(process.uptime()),
            db_size_bytes: databaseSize(),
          },
          { headers: { "cache-control": "no-store" } },
        );
      } catch {
        return Response.json(
          {
            ok: false,
            db: "unavailable",
            auth: authConfigured ? "ok" : "missing",
            version: "0.1.0",
            uptime_s: Math.round(process.uptime()),
            db_size_bytes: null,
          },
          { status: 503, headers: { "cache-control": "no-store" } },
        );
      }
    },
    { request },
  );
}
