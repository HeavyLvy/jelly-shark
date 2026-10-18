import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

/**
 * Jelly Shark's own SQLite database, accessed through Drizzle (typed queries,
 * no hand-written SQL). Path: DATABASE_PATH, default ./data/jelly-shark.db
 * (the container keeps it on the /data volume). One connection per process,
 * WAL mode; pending migrations from ./drizzle are applied when it first opens.
 */
export function databasePath(): string {
  // Runtime path, never a bundled asset: tell Turbopack not to trace it.
  return resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH?.trim() || "data/jelly-shark.db");
}

function open() {
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolve(/* turbopackIgnore: true */ process.cwd(), "drizzle") });
  return db;
}

export type Db = BetterSQLite3Database<typeof schema>;

// Survives dev hot reloads (a fresh module instance would otherwise reopen the file each time).
const g = globalThis as typeof globalThis & { __jellySharkDb?: Db };

export function db(): Db {
  return (g.__jellySharkDb ??= open());
}
