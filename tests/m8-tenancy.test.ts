import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { setup, asOwner } from './helpers';
import { createOrg } from '../src/lib/server/orgs';
import { getDb, getRootDb, schema, withOrg } from '../src/lib/server/db';
import { pullEntries } from '../src/lib/server/processes/pull';
import { listEntries } from '../src/lib/server/processes/view';
import { setComponentState, isEnabled } from '../src/lib/server/components';
import { drain } from '../src/lib/server/processes/queue';
import { POST as addLedgerRoute } from '../src/routes/api/ledgers/+server';
import { POST as toggleRoute } from '../src/routes/api/system/components/[id]/state/+server';

/** A minimal RequestEvent for calling route handlers directly. */
function ev(method: string, routeId: string, path: string, body: unknown, params: Record<string, string> = {}) {
  const url = new URL(`http://test${path}`);
  return { request: new Request(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    route: { id: routeId }, params, url, locals: { user: 'owner@test', role: 'owner' } } as never;
}

// Every assertion runs as books_app (APP_DB_ROLE), so row-level security — not app code — does the isolating.
describe('M8 · tenancy (two orgs, RLS)', () => {
  let a: string;
  let b: string;
  beforeEach(async () => {
    a = (await setup()).orgId; // session org = A
    b = await createOrg('Second company');
  });

  it('runs as the non-owner role with the org set on the session', async () => {
    const r = await getDb().execute(sql`select current_user as u, current_setting('app.org_id', true) as o`);
    const row = ((r as unknown as { rows?: { u: string; o: string }[] }).rows ?? (r as unknown as { u: string; o: string }[]))[0];
    expect(row).toEqual({ u: 'books_app', o: a });
  });

  it("org B sees none of org A's entries, recommendations or runs", async () => {
    await pullEntries({ wait: true });
    const inA = (await listEntries()).length;
    expect(inA).toBeGreaterThan(20);
    await withOrg(b, async () => {
      expect(await listEntries()).toHaveLength(0);
      expect(await getDb().select().from(schema.recommendations)).toHaveLength(0);
      expect(await getDb().select().from(schema.runs)).toHaveLength(0);
    });
    // The owner sees both orgs' rows; A still sees only its own.
    await withOrg(b, () => pullEntries({ wait: true }));
    const all = await asOwner(() => getRootDb().select({ org: schema.ledgerItems.orgId }).from(schema.ledgerItems));
    expect(new Set(all.map((x) => x.org))).toEqual(new Set([a, b]));
    expect((await listEntries()).length).toBe(inA);
  });

  it('two companies can both have conn_slash and the same external ids (composite keys)', async () => {
    await pullEntries({ wait: true });
    const nA = (await listEntries()).length;
    const nB = await withOrg(b, async () => { await pullEntries({ wait: true }); return (await listEntries()).length; });
    expect(nB).toBe(nA);
    const rows = await asOwner(() => getRootDb().select({ org: schema.ledgerItems.orgId, id: schema.ledgerItems.id }).from(schema.ledgerItems));
    const ids = (org: string) => new Set(rows.filter((r) => r.org === org).map((r) => r.id));
    expect([...ids(a)].every((id) => ids(b).has(id))).toBe(true);
  });

  it("B's switches don't affect A", async () => {
    await withOrg(b, () => setComponentState('AI.entry.recommend', false, 'owner-b'));
    expect(await withOrg(b, () => isEnabled('AI.entry.recommend'))).toBe(false);
    expect(await isEnabled('AI.entry.recommend')).toBe(true);
  });

  it("a write tagged with another org's id is refused by RLS", async () => {
    const err = await getDb().insert(schema.dimensionValues)
      .values({ orgId: b, id: 'qbo:999', dimension: 'account', name: 'Sneaky', updatedAt: '2026-11-20T00:00:00Z' })
      .then(() => null, (e: Error & { cause?: Error }) => e.cause?.message ?? e.message);
    expect(err).toMatch(/row-level security/);
  });

  it('each new org gets its own 9 eval cases', async () => {
    expect(await getDb().select().from(schema.evalCases)).toHaveLength(9);
    expect(await withOrg(b, () => getDb().select().from(schema.evalCases))).toHaveLength(9);
  });

  it('queued jobs run in the org that queued them', async () => {
    await withOrg(b, () => pullEntries({ wait: false }));
    await drain();
    const nB = await withOrg(b, async () => (await getDb().select().from(schema.recommendations)).length);
    expect(nB).toBeGreaterThan(0);
    expect(await getDb().select().from(schema.recommendations)).toHaveLength(0);
  });

  it('every write through the API leaves one audit row in its org; secrets are redacted', async () => {
    const r1 = await toggleRoute(ev('POST', '/api/system/components/[id]/state', '/api/system/components/AI.entry.recommend/state', { enabled: false }, { id: 'AI.entry.recommend' }));
    expect(r1.status).toBe(200);
    const r2 = await addLedgerRoute(ev('POST', '/api/ledgers', '/api/ledgers', { kind: 'mercury', name: 'Mercury', mode: 'fixture', token: 'mercury-secret-123' }));
    expect(r2.status).toBe(200);
    const rows = await getDb().select().from(schema.auditLog);
    expect(rows.map((r) => r.action).sort()).toEqual(['FE.component.toggle', 'FE.ledger.add']);
    expect(rows.find((r) => r.action === 'FE.component.toggle')!.subject).toBe('AI.entry.recommend');
    const all = JSON.stringify(rows);
    expect(all).not.toContain('mercury-secret-123');
    expect(all).toContain('[redacted]');
    expect(await withOrg(b, () => getDb().select().from(schema.auditLog))).toHaveLength(0);
  });

  it('a failed write is not audited', async () => {
    const r = await toggleRoute(ev('POST', '/api/system/components/[id]/state', '/x', { enabled: 'nope' }, { id: 'AI.entry.recommend' }));
    expect(r.status).toBe(400);
    expect(await getDb().select().from(schema.auditLog)).toHaveLength(0);
  });
});
