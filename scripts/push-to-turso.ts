import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type InStatement, type InValue } from "@libsql/client/http";
import { openDatabase } from "../server/db/open";

function loadTursoEnvFromDotenv(): void {
  const envFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    ".env.local",
  );
  if (!fs.existsSync(envFile)) return;
  const wanted = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];
  for (const raw of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(raw);
    if (!match) continue;
    const key = match[1];
    if (!wanted.includes(key) || process.env[key]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function normalizeHttpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("libsql://")) {
    return `https://${trimmed.slice("libsql://".length)}`;
  }
  return trimmed;
}

function toLibsqlValue(value: unknown): InValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  return String(value);
}

function sortTablesByDependencies(
  tables: string[],
  deps: Map<string, Set<string>>,
): string[] {
  const remaining = new Set(tables);
  const ordered: string[] = [];

  while (remaining.size > 0) {
    const ready: string[] = [];
    for (const table of remaining) {
      const needed = deps.get(table) ?? new Set<string>();
      const unresolved = [...needed].filter((dep) => dep !== table && remaining.has(dep));
      if (unresolved.length === 0) ready.push(table);
    }

    if (ready.length === 0) {
      // Fallback for cyclic self/mutual references
      const next = [...remaining].sort()[0];
      ordered.push(next);
      remaining.delete(next);
      continue;
    }

    ready.sort();
    for (const table of ready) {
      ordered.push(table);
      remaining.delete(table);
    }
  }

  return ordered;
}

async function applyMigrationsToTurso(
  client: ReturnType<typeof createClient>,
  migrationsDir: string,
): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "__migrations" (
      "filename" TEXT PRIMARY KEY NOT NULL,
      "sha256" TEXT NOT NULL,
      "applied_at" INTEGER NOT NULL
    )
  `);

  const existingResult = await client.execute(
    'SELECT "filename", "sha256" FROM "__migrations"',
  );
  const existing = new Map<string, string>();
  for (const row of existingResult.rows) {
    const filename = String(row.filename ?? row[0]);
    const sha256 = String(row.sha256 ?? row[1]);
    existing.set(filename, sha256);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const sha256 = crypto.createHash("sha256").update(sql).digest("hex");
    const prev = existing.get(file);
    if (prev) {
      if (prev !== sha256) {
        throw new Error(`Migration ${file} changed after being applied on Turso.`);
      }
      console.log(`[migrate] already applied ${file}`);
      continue;
    }

    await client.executeMultiple(sql);
    await client.execute({
      sql: 'INSERT INTO "__migrations" ("filename", "sha256", "applied_at") VALUES (?, ?, ?)',
      args: [file, sha256, Date.now()],
    });
    console.log(`[migrate] applied ${file}`);
  }
}

async function main() {
  loadTursoEnvFromDotenv();

  const rawUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!rawUrl) {
    throw new Error("TURSO_DATABASE_URL is required");
  }

  const client = createClient({
    url: normalizeHttpUrl(rawUrl),
    authToken,
  });

  const migrationsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "server/db/migrations",
  );
  await applyMigrationsToTurso(client, migrationsDir);

  const localPath = path.resolve(process.env.DATABASE_PATH || "./data/kirameku.db");
  if (!fs.existsSync(localPath)) {
    console.log(`[push] local SQLite not found at ${localPath}; schema migration only.`);
    return;
  }

  const sqlite = openDatabase(localPath, { readonly: true, fileMustExist: true });
  try {
    const tableRows = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__migrations' ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    const tableNames = tableRows.map((row) => row.name);
    const deps = new Map<string, Set<string>>();
    for (const table of tableNames) {
      const fkRows = sqlite
        .prepare(`PRAGMA foreign_key_list("${table.replaceAll('"', '""')}")`)
        .all() as Array<{ table: string }>;
      deps.set(table, new Set(fkRows.map((row) => row.table)));
    }

    const orderedTables = sortTablesByDependencies(tableNames, deps);
    console.log(`[push] syncing ${orderedTables.length} tables from ${localPath} -> Turso...`);

    const BATCH_SIZE = 50;
    let totalRows = 0;

    for (const table of orderedTables) {
      const quotedTable = `"${table.replaceAll('"', '""')}"`;
      const rows = sqlite.prepare(`SELECT * FROM ${quotedTable}`).all() as Array<
        Record<string, unknown>
      >;
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const colList = columns.map((col) => `"${col.replaceAll('"', '""')}"`).join(", ");
      const placeholders = columns.map(() => "?").join(", ");
      const insertSql = `INSERT OR REPLACE INTO ${quotedTable} (${colList}) VALUES (${placeholders})`;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const statements: InStatement[] = chunk.map((row) => ({
          sql: insertSql,
          args: columns.map((col) => toLibsqlValue(row[col])),
        }));
        await client.batch(statements, "write");
      }

      const countRes = await client.execute(`SELECT count(*) AS n FROM ${quotedTable}`);
      const remoteCount = Number(countRes.rows[0]?.n ?? countRes.rows[0]?.[0] ?? 0);
      totalRows += rows.length;
      console.log(`[push] ${table}: local=${rows.length}, turso=${remoteCount}`);
    }

    console.log(`[push] done! synced ${totalRows} rows across ${orderedTables.length} tables.`);
  } finally {
    sqlite.close();
    client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
