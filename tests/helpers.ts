// Test harness: one in-memory PGlite per test file (migrated once), a fresh org per test.
// Each test runs as the non-owner role under row-level security, so isolation between tests is RLS itself.
import { sql } from 'drizzle-orm';
import { openDb, setRoot, useSessionOrg, getRootDb } from '../src/lib/server/db';
import { createOrg } from '../src/lib/server/orgs';
import { setPorts } from '../src/lib/server/ports';
import { FixtureSlash } from '../src/lib/server/slash.fixture';
import { FixtureQbo } from '../src/lib/server/qbo';
import { FixtureQboWriter } from '../src/lib/server/qbo.write';
import { FixtureMercury } from '../src/lib/server/ledgers/mercury';
import { FixtureModel } from '../src/lib/server/ai/model';
import { resetAdapters } from '../src/lib/server/ledgers/registry';

process.env.TOKEN_ENC_KEY ??= 'test-only-key';
process.env.APP_DB_ROLE ??= 'books_app';

let opened: Promise<void> | null = null;

export async function setup() {
  if (!opened) opened = openDb('pglite:memory').then((r) => setRoot(r));
  await opened;
  const orgId = await createOrg('Test org');
  await useSessionOrg(orgId);
  const ports = { slash: new FixtureSlash(), qbo: new FixtureQbo(), model: new FixtureModel(), local: null, mercury: new FixtureMercury(), qboWriter: new FixtureQboWriter() };
  setPorts(ports);
  resetAdapters();
  return { orgId, ...ports };
}

/**
 * Run fn as the owner role (bypasses RLS) — for cross-org assertions. PGlite has one connection, so the
 * "root" handle shares the session's role; drop to the owner for fn, then restore books_app.
 */
export async function asOwner<T>(fn: () => Promise<T>): Promise<T> {
  const db = getRootDb();
  await db.execute(sql`reset role`);
  try { return await fn(); } finally { await db.execute(sql.raw(`set role ${process.env.APP_DB_ROLE}`)); }
}
