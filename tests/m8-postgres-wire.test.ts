// The production driver path: postgres-js over the Postgres wire protocol (what runs on Fly against Neon),
// served locally by PGlite through @electric-sql/pglite-socket. Unit tests elsewhere use PGlite directly, which
// skips postgres-js entirely — that gap hid two production bugs (reserved connections lacking `options`,
// then `begin`). Note: PGlite is one backend session shared by all sockets, so this file runs sequentially.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { sql } from 'drizzle-orm';
import { openDb, setRoot, getDb, getRootDb, withOrg, schema } from '../src/lib/server/db';
import { createOrg } from '../src/lib/server/orgs';
import { setPorts } from '../src/lib/server/ports';
import { FixtureSlash } from '../src/lib/server/slash.fixture';
import { FixtureQbo } from '../src/lib/server/qbo';
import { FixtureQboWriter } from '../src/lib/server/qbo.write';
import { FixtureMercury } from '../src/lib/server/ledgers/mercury';
import { FixtureModel } from '../src/lib/server/ai/model';
import { resetAdapters } from '../src/lib/server/ledgers/registry';
import { pullEntries } from '../src/lib/server/processes/pull';
import { listEntries } from '../src/lib/server/processes/view';

process.env.APP_DB_ROLE = 'books_app';
process.env.DB_POOL_MAX = '2';
process.env.TOKEN_ENC_KEY ??= 'test-only-key';

let server: PGLiteSocketServer;
let pg: PGlite;
let close: () => Promise<void>;

beforeAll(async () => {
  pg = new PGlite();
  server = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 4 });
  await server.start();
  const port = Number(server.getServerConn().split(':').pop());
  const r = await openDb(`postgres://postgres:postgres@127.0.0.1:${port}/postgres`, { migrate: true });
  setRoot(r);
  close = r.close;
  setPorts({ slash: new FixtureSlash(), qbo: new FixtureQbo(), model: new FixtureModel(), local: null, mercury: new FixtureMercury(), qboWriter: new FixtureQboWriter() });
  resetAdapters();
}, 60_000);

afterAll(async () => {
  await close?.();
  await server?.stop();
  await pg?.close();
});

describe('M8 · postgres-js wire path (production driver)', () => {
  it('a company context runs as books_app with app.org_id set, on a reserved connection', async () => {
    const org = await createOrg('Wire co');
    const row = await withOrg(org, async () => {
      const res = await getDb().execute(sql`select current_user as u, current_setting('app.org_id', true) as o`);
      return (res as unknown as { u: string; o: string }[])[0];
    });
    expect(row).toEqual({ u: 'books_app', o: org });
  });

  it('transactions and savepoints work inside a company context (pull uses db.transaction)', async () => {
    const org = await createOrg('Wire tx co');
    const n = await withOrg(org, async () => {
      await pullEntries({ wait: true });
      return (await listEntries()).length;
    });
    expect(n).toBeGreaterThan(20);
    // Nested transaction → savepoint; an inner failure rolls back only the inner part.
    const kept = await withOrg(org, async () => {
      await getDb().transaction(async (tx) => {
        await tx.insert(schema.auditLog).values({ id: 'aud_outer', actor: 'test', action: 'outer', at: '2026-11-21T00:00:00Z' });
        await tx.transaction(async (inner) => {
          await inner.insert(schema.auditLog).values({ id: 'aud_inner', actor: 'test', action: 'inner', at: '2026-11-21T00:00:00Z' });
          throw new Error('roll back inner only');
        }).catch(() => undefined);
      });
      return (await getDb().select({ id: schema.auditLog.id }).from(schema.auditLog)).map((r) => r.id);
    });
    expect(kept).toContain('aud_outer');
    expect(kept).not.toContain('aud_inner');
  });

  it('after the context ends, the connection is back to the owner with no company set', async () => {
    const res = await getRootDb().execute(sql`select current_user as u, coalesce(current_setting('app.org_id', true), '') as o`);
    expect((res as unknown as { u: string; o: string }[])[0]).toEqual({ u: 'postgres', o: '' });
  });
});
