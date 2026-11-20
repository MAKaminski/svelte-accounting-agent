// Test harness: one in-memory PGlite per test file (migrated once), a fresh org per test.
// Each test runs as the non-owner role under row-level security, so isolation between tests is RLS itself.
import { randomUUID } from 'node:crypto';
import { openDb, setRoot, getRootDb, useSessionOrg, schema } from '../src/lib/server/db';
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

/** Create an org (as the owner role) and return its id. */
export async function createOrg(name = 'Test org') {
  const id = `org_${randomUUID().slice(0, 8)}`;
  await getRootDb().insert(schema.orgs).values({ id, name, createdAt: new Date().toISOString() });
  return id;
}

export async function setup() {
  if (!opened) opened = openDb('pglite:memory').then((r) => setRoot(r));
  await opened;
  const orgId = await createOrg();
  await useSessionOrg(orgId);
  const ports = { slash: new FixtureSlash(), qbo: new FixtureQbo(), model: new FixtureModel(), local: null, mercury: new FixtureMercury(), qboWriter: new FixtureQboWriter() };
  setPorts(ports);
  resetAdapters();
  return { orgId, ...ports };
}
