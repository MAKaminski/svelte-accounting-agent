// Database: Postgres via postgres-js (Neon, production) or PGlite (tests and local dev, in-process).
//
// Tenancy: every tenant query runs inside an org context — a connection whose session has
// app.org_id set and (when APP_DB_ROLE is set) the non-owner role, so row-level security applies.
//   - withOrg(orgId, fn): per request / per job. postgres-js reserves a pool connection for it.
//   - getDb(): the current context's db. Outside a context it falls back to the "session org"
//     (tests/scripts on a single PGlite connection), and otherwise throws.
//   - getRootDb(): unscoped owner connection — only for auth lookups and listing orgs.
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import './compat';

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };

interface Root {
  kind: 'pglite' | 'postgres';
  db: DB;
  close: () => Promise<void>;
  /** postgres-js only: reserve a dedicated connection. */
  reserve?: () => Promise<{ db: DB; exec: (q: string) => Promise<void>; release: () => void }>;
}

interface Ctx { db: DB; orgId: string; userId: string | null }

const als = new AsyncLocalStorage<Ctx>();
let root: Root | null = null;
let sessionOrg: string | null = null;

const MIGRATIONS = () => resolve(process.cwd(), 'drizzle');
const role = () => process.env.APP_DB_ROLE ?? '';
const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad role name ${s}`);
  return s;
};

/** Open (and migrate) a database. `url`: postgres://… (Neon), `pglite:memory`, or `pglite:<dir>`. */
export async function openDb(url = process.env.DATABASE_URL ?? 'pglite:data/pglite', opts: { migrate?: boolean } = {}): Promise<Root> {
  let r: Root;
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const dir = url.slice('pglite:'.length);
    if (dir !== 'memory') mkdirSync(resolve(dir), { recursive: true });
    const client = dir === 'memory' ? new PGlite() : new PGlite(resolve(dir));
    const db = drizzle(client, { schema }) as unknown as DB;
    if (opts.migrate !== false) {
      const { migrate } = await import('drizzle-orm/pglite/migrator');
      await migrate(db as never, { migrationsFolder: MIGRATIONS() });
    }
    r = { kind: 'pglite', db, close: () => client.close() };
  } else {
    const postgres = (await import('postgres')).default;
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const client = postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 10), idle_timeout: 60, connect_timeout: 10, prepare: false });
    const db = drizzle(client, { schema }) as unknown as DB;
    if (opts.migrate) {
      const { migrate } = await import('drizzle-orm/postgres-js/migrator');
      await migrate(db as never, { migrationsFolder: MIGRATIONS() });
    }
    r = {
      kind: 'postgres', db, close: () => client.end(),
      reserve: async () => {
        const conn = await client.reserve();
        return { db: drizzle(conn as never, { schema }) as unknown as DB, exec: async (q) => { await conn.unsafe(q); }, release: () => conn.release() };
      }
    };
  }
  return r;
}

export function setRoot(r: Root | null) { root = r; sessionOrg = null; }
export function getRootDb(): DB {
  if (!root) throw new Error('database not initialised (call initDb())');
  return root.db;
}
export function rootKind() { return root?.kind ?? null; }

let initPromise: Promise<void> | null = null;
/** Lazily open the configured database once (server and scripts). */
export function initDb(): Promise<void> {
  if (root) return Promise.resolve();
  if (!initPromise) initPromise = openDb().then((r) => { root = r; });
  return initPromise;
}

async function enterOrg(exec: (q: string) => Promise<void>, orgId: string) {
  await exec(`select set_config('app.org_id', '${orgId.replace(/'/g, "''")}', false)`);
  if (role()) await exec(`set role ${ident(role())}`);
}
async function leaveOrg(exec: (q: string) => Promise<void>) {
  if (role()) await exec('reset role');
  await exec(`select set_config('app.org_id', '', false)`);
}

/**
 * Single-connection session org (tests, scripts, local PGlite): sets app.org_id (+ role) on the session
 * so code outside withOrg still runs under RLS for that org.
 */
export async function useSessionOrg(orgId: string) {
  if (!root) throw new Error('database not initialised');
  if (root.kind !== 'pglite') throw new Error('useSessionOrg is for the single-connection PGlite driver');
  await enterOrg((q) => root!.db.execute(sql.raw(q)).then(() => undefined), orgId);
  sessionOrg = orgId;
}

// PGlite has one connection, so org contexts take turns. Re-entrant per org: the session is entered when the
// lock is first taken and restored only when the last holder releases it.
let lock: { orgId: string; count: number } | null = null;
const waiters: (() => void)[] = [];
async function acquire(orgId: string, exec: (q: string) => Promise<void>) {
  while (lock && lock.orgId !== orgId) await new Promise<void>((r) => waiters.push(r));
  if (lock) { lock.count++; return; }
  lock = { orgId, count: 1 };
  await enterOrg(exec, orgId);
}
async function release(exec: (q: string) => Promise<void>) {
  if (!lock || --lock.count > 0) return;
  try {
    // Restore the session org (tests/scripts) or clear it.
    if (sessionOrg) { if (sessionOrg !== lock.orgId) await enterOrg(exec, sessionOrg); }
    else await leaveOrg(exec);
  } finally {
    lock = null;
    waiters.splice(0).forEach((w) => w());
  }
}

/** Run fn with the org's RLS context. Re-entrant: a nested call for the same org reuses the context. */
export async function withOrg<T>(orgId: string, fn: () => Promise<T>, userId: string | null = null): Promise<T> {
  await initDb();
  const cur = als.getStore();
  if (cur && cur.orgId === orgId) return fn();
  const r = root!;
  if (r.kind === 'pglite') {
    const exec = (q: string) => r.db.execute(sql.raw(q)).then(() => undefined);
    await acquire(orgId, exec);
    try {
      return await als.run({ db: r.db, orgId, userId }, fn);
    } finally {
      await release(exec);
    }
  }
  const conn = await r.reserve!();
  try {
    await enterOrg(conn.exec, orgId);
    return await als.run({ db: conn.db, orgId, userId }, fn);
  } finally {
    try { await leaveOrg(conn.exec); } finally { conn.release(); }
  }
}

export function getDb(): DB {
  const c = als.getStore();
  if (c) return c.db;
  if (root && sessionOrg) return root.db;
  throw new Error('No org context: wrap the call in withOrg(orgId, …)');
}

export function currentOrgId(): string {
  const c = als.getStore();
  if (c) return c.orgId;
  if (sessionOrg) return sessionOrg;
  throw new Error('No org context');
}
/**
 * Run fn in a fresh org context, detached from the caller's (a queued job may outlive the request that
 * queued it, and that request's reserved connection is released when it ends).
 */
export function withOrgDetached<T>(orgId: string, fn: () => Promise<T>, userId: string | null = null): Promise<T> {
  return als.exit(() => withOrg(orgId, fn, userId));
}

/** True inside withOrg (not for the tests' session org, which needs no re-entry). */
export function hasOrgContext() { return !!als.getStore(); }
export function currentUserId(): string | null {
  return als.getStore()?.userId ?? null;
}

/**
 * Scheduler leader election: hold a session advisory lock on one dedicated connection for the life of the
 * process. During a deploy overlap only the holder runs jobs; when it exits, Postgres frees the lock.
 * PGlite (one process) is always the leader.
 */
let leaderConn: { release: () => void } | null = null;
export async function tryLeaderLock(key = 0x6c6c78 /* "llx" */): Promise<boolean> {
  await initDb();
  const r = root!;
  if (r.kind === 'pglite' || leaderConn) return true;
  const conn = await r.reserve!();
  const res = (await conn.db.execute(sql`select pg_try_advisory_lock(${key}) as ok`)) as unknown as { ok: boolean }[];
  if (res[0]?.ok) { leaderConn = conn; return true; }
  conn.release();
  return false;
}

/** First row or undefined (replaces better-sqlite3's .get()). */
export async function first<T>(q: PromiseLike<T[]>): Promise<T | undefined> {
  return (await q)[0];
}
