import { describe, it, expect, beforeEach } from 'vitest';
import { setup } from './helpers';
import { pullEntries } from '../src/lib/server/processes/pull';
import { getDb, schema } from '../src/lib/server/db';
import { eq } from 'drizzle-orm';

describe('M1 · MW.coa.pull + MW.ledger.pull', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { ctx = await setup(); });

  it('pulls 23 entries in review, 4 new merchants, and is idempotent on rerun', async () => {
    const r1 = await pullEntries({ wait: true });
    expect(r1.pulled).toBe(23);
    expect(r1.newMerchants).toBe(4);
    const db = getDb();
    const count = async () => (await db.select().from(schema.ledgerItems).where(eq(schema.ledgerItems.ledgerStatus, 'in_review')).all()).length;
    expect(await count()).toBe(23);
    const recsBefore = (await db.select().from(schema.recommendations).all()).length;
    const evBefore = (await db.select().from(schema.evidence).all()).length;
    const r2 = await pullEntries({ wait: true });
    expect(r2.pulled).toBe(23);
    expect(await count()).toBe(23);
    expect((await db.select().from(schema.recommendations).all()).length).toBe(recsBefore);
    expect((await db.select().from(schema.evidence).all()).length).toBe(evBefore);
  });

  it('loads the chart of accounts from the Slash account dimension', async () => {
    await pullEntries({ wait: true });
    const accts = await getDb().select().from(schema.dimensionValues).all();
    expect(accts.length).toBe(11);
    expect(accts.find((a) => a.id === 'dv_misc_old')?.enabled).toBe(false);
  });

  it('dry run writes nothing', async () => {
    const r = await pullEntries({ dryRun: true });
    expect(r.pulled).toBe(23);
    expect((await getDb().select().from(schema.ledgerItems).all()).length).toBe(0);
  });

  it('every pulled entry ends recommended or invalid (none stuck)', async () => {
    const r = await pullEntries({ wait: true });
    const states = new Set(r.entries.map((e) => e.state));
    expect([...states].every((s) => s === 'recommended' || s === 'invalid')).toBe(true);
  });
});
