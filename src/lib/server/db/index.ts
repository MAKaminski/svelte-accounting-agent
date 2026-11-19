import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema>;
export { schema };

let instance: { db: DB; sqlite: Database.Database } | null = null;

/** Open (and migrate) a database. `:memory:` is used by tests. */
export function openDb(path = process.env.DB_PATH ?? 'data/books.db'): { db: DB; sqlite: Database.Database } {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  return { db, sqlite };
}

export function getDb(): DB {
  if (!instance) instance = openDb();
  return instance.db;
}

export function getSqlite(): Database.Database {
  if (!instance) instance = openDb();
  return instance.sqlite;
}

/** Tests swap in an in-memory database. */
export function setDb(next: { db: DB; sqlite: Database.Database } | null) {
  instance = next;
}
