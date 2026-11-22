import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { setup } from './helpers';
import { pullEntries } from '../src/lib/server/processes/pull';
import { approve, commit, commitDue } from '../src/lib/server/processes/decide';
import { listMappings, applyMapping } from '../src/lib/server/processes/mappings';
import { getEntry, listEntries } from '../src/lib/server/processes/view';
import { setComponentState } from '../src/lib/server/components';
import { addConnection, setConnectionStatus, getAdapter, listConnections } from '../src/lib/server/ledgers/registry';
import { getDb, schema } from '../src/lib/server/db';

async function addMercury(opts: { confirm?: boolean; map?: boolean; activate?: boolean } = {}) {
  const { confirm = true, map = true, activate = true } = opts;
  await addConnection({ id: 'conn_mercury', kind: 'mercury', name: 'Mercury', mode: 'fixture', bankFeedConfirmed: confirm,
    config: map ? { qboBankAccountIdByAccount: { acc_chk: '10' } } : {} });
  if (activate) await setConnectionStatus('conn_mercury', true);
}
const mercury = async () => (await listEntries()).filter((e) => e.connectionId === 'conn_mercury');
const byName = async (name: string, conn = 'conn_mercury') => (await listEntries()).filter((e) => e.connectionId === conn && e.merchantName === name).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

describe('M7 · ledger connections', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { ctx = await setup(); });

  it('a QuickBooks-direct ledger cannot be activated without the bank-feed confirmation and a bank mapping', async () => {
    await addMercury({ confirm: false, map: false, activate: false });
    await expect(setConnectionStatus('conn_mercury', true)).rejects.toThrow(/booked twice/);
    await expect(setConnectionStatus('conn_mercury', true)).rejects.toThrow(/QuickBooks bank account/);
  });

  it('pulls Slash and Mercury side by side; Mercury items carry the kind hint; QuickBooks chart loaded', async () => {
    await addMercury();
    const r = await pullEntries({ wait: true });
    expect(r.pulled).toBe(23 + 8);
    expect(await mercury()).toHaveLength(8);
    const savings = (await byName('Mercury Savings'))[0];
    expect(savings.recommendation).toMatchObject({ action: 'ask', model: 'rules:guard' });
    const dims = await getDb().select().from(schema.dimensionValues).all();
    expect(dims.find((d) => d.id === 'qbo:54')).toMatchObject({ source: 'qbo', enabled: true, qboAccountId: '54' });
    expect(dims.find((d) => d.id === 'qbo:90')!.enabled).toBe(false); // Uncategorized is never a target
    expect((await listConnections()).find((c) => c.id === 'conn_mercury')!.lastPullAt).not.toBeNull();
  });

  it('Mercury research reads glAllocations history; recommendation uses the QuickBooks chart', async () => {
    await addMercury();
    await pullEntries({ wait: true });
    const e = (await getEntry((await byName('Canva'))[0].id))!;
    expect(e.evidence.find((x) => x.kind === 'slash_history')!.summary).toMatch(/3 prior entries from Canva: 3× Software & Subscriptions/);
    expect(e.recommendation!.lines[0]).toMatchObject({ valueId: 'qbo:54', accountName: 'Software & Subscriptions' });
    expect(e.writesTo).toMatch(/QuickBooks directly/);
  });

  it('approve with no QuickBooks match → one Purchase created with requestid = decision id; rerun is idempotent', async () => {
    await addMercury();
    await pullEntries({ wait: true });
    const id = (await byName('FACEBK ADS'))[0].id;
    const d = await approve(id, {});
    expect(d.state).toBe('ready');
    const creates = ctx.qboWriter.writes.filter((w) => w.op === 'create');
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ requestId: d.id, txn: { type: 'Purchase', bankAccountId: '10', totalCents: -3000, privateNote: `Accounting Agent ${d.id}` } });
    expect(creates[0].txn.lines).toEqual([expect.objectContaining({ accountId: '53', amountCents: 3000 })]);
    expect((await getEntry(id))!.qboTxnId).toBe(creates[0].txn.id);
    // Force a second commit attempt: dedupe finds our own txn by marker, nothing new is written.
    await getDb().update(schema.ledgerItems).set({ localState: 'approved', pendingUntil: null }).where(eq(schema.ledgerItems.id, id)).run();
    await commit(id);
    expect(ctx.qboWriter.writes.filter((w) => w.op === 'create')).toHaveLength(1);
    expect((await getEntry(id))!.state).toBe('ready');
    expect(ctx.slash.writes).toHaveLength(0); // Slash is never touched for a Mercury item
  });

  it('an uncategorized QuickBooks match is recoded instead of duplicated', async () => {
    await addMercury();
    await pullEntries({ wait: true });
    const id = (await byName('ULINE'))[0].id;
    await approve(id, {});
    const e = (await getEntry(id))!;
    expect(e.state).toBe('ready');
    expect(e.qboTxnId).toBe('qb_1');
    expect(e.stateReason).toMatch(/was uncategorized/);
    expect(ctx.qboWriter.writes.map((w) => w.op)).toEqual(['update']);
    expect(ctx.qboWriter.txns.find((t) => t.id === 'qb_1')!.lines[0]).toMatchObject({ accountId: '52', accountName: 'Supplies' });
  });

  it('a QuickBooks match coded to a different account stops for a human (invalid), nothing written', async () => {
    await addMercury();
    await pullEntries({ wait: true });
    const id = (await byName('USPS'))[0].id;
    await approve(id, {});
    const e = (await getEntry(id))!;
    expect(e.state).toBe('invalid');
    expect(e.stateReason).toMatch(/already codes this to Advertising & Marketing/);
    expect(ctx.qboWriter.writes).toHaveLength(0);
  });

  it('qbo.write off → Mercury approvals are held; back on → written', async () => {
    await addMercury();
    await pullEntries({ wait: true });
    await setComponentState('qbo.write', false, 'owner');
    const id = (await byName('FACEBK ADS'))[0].id;
    expect((await approve(id, {})).state).toBe('approved');
    expect((await getEntry(id))!.stateReason).toMatch(/qbo.write/);
    expect(ctx.qboWriter.writes).toHaveLength(0);
    await setComponentState('qbo.write', true, 'owner');
    await commitDue();
    expect((await getEntry(id))!.state).toBe('ready');
    expect(ctx.qboWriter.writes).toHaveLength(1);
  });

  it('Slash path is unchanged next to Mercury: Slash write, no QuickBooks write', async () => {
    await addMercury();
    await pullEntries({ wait: true });
    const id = (await byName('USPS PO 1234', 'conn_slash'))[0].id;
    expect((await approve(id, {})).state).toBe('ready');
    expect(ctx.slash.writes.map((w) => w.op)).toEqual(['updateEntry', 'markReady']);
    expect(ctx.qboWriter.writes).toHaveLength(0);
  });

  it('local rules for Mercury: 3 consistent approvals → proposal → apply → next Canva coded by rule, 0 model calls', async () => {
    await addMercury();
    await pullEntries({ wait: true });
    for (const e of await byName('Canva')) await approve(e.id, {});
    const [p] = await listMappings('proposed');
    expect(p).toMatchObject({ connectionId: 'conn_mercury', target: 'local', sourceId: 'cp:canva', valueId: 'qbo:54', supportCount: 3 });
    expect(ctx.qboWriter.writes.filter((w) => w.op === 'create')).toHaveLength(3); // recurring same amount is not mistaken for a duplicate
    await applyMapping(p.id, { yes: true });
    expect(await getDb().select().from(schema.localMappings).all()).toHaveLength(1);
    ctx.mercury.addTransaction({ id: 'm-9001', accountId: 'acc_chk', amount: -14.99, createdAt: '2026-11-19T15:00:00.000Z', postedAt: '2026-11-19T18:00:00.000Z',
      status: 'sent', kind: 'debitCardTransaction', counterpartyName: 'Canva', bankDescription: null, note: null, externalMemo: null, glAllocations: [], accountingStatus: { status: 'pending' } });
    const before = ctx.model.calls.length;
    await pullEntries({ wait: true });
    const e = (await getEntry('mtx_m-9001'))!;
    expect(e.recommendation).toMatchObject({ model: 'rules:mapping', confidence: 0.99 });
    expect(e.recommendation!.lines[0].valueId).toBe('qbo:54');
    expect(ctx.model.calls.length).toBe(before);
    expect(ctx.slash.writes.filter((w) => w.op === 'upsertMapping')).toHaveLength(0);
  });

  it('two same-amount charges within 3 days are both written (our own earlier write is not a duplicate)', async () => {
    await addMercury();
    ctx.mercury.addTransaction({ id: 'm-9100', accountId: 'acc_chk', amount: -30, createdAt: '2026-11-17T15:00:00.000Z', postedAt: '2026-11-17T18:00:00.000Z',
      status: 'sent', kind: 'debitCardTransaction', counterpartyName: 'FACEBK ADS', bankDescription: null, note: null, externalMemo: null, glAllocations: [], accountingStatus: { status: 'pending' } });
    await pullEntries({ wait: true });
    const [a, b] = await byName('FACEBK ADS');
    await approve(a.id, {});
    await approve(b.id, {});
    expect(ctx.qboWriter.writes.filter((w) => w.op === 'create')).toHaveLength(2);
    expect((await getEntry(b.id))!.state).toBe('ready');
  });

  it('inactive connections are not pulled and cannot be approved', async () => {
    await addMercury();
    await pullEntries({ wait: true });
    await setConnectionStatus('conn_mercury', false);
    await expect(approve((await byName('FACEBK ADS'))[0].id, {})).rejects.toThrow(/inactive/);
    await expect(pullEntries({ connectionId: 'conn_mercury' })).rejects.toThrow(/not active/);
  });

  it('Mercury note is off by default; switched on, it is written after the QuickBooks write', async () => {
    await addMercury();
    await pullEntries({ wait: true });
    await approve((await byName('FACEBK ADS'))[0].id, {});
    expect(ctx.mercury.updates).toHaveLength(0);
    await setComponentState('mercury.annotate', true, 'owner');
    await approve((await byName('Canva'))[0].id, {});
    expect(ctx.mercury.updates).toEqual([expect.objectContaining({ id: 'm-0007', body: { note: 'Coded in QuickBooks by Accounting Agent: Software & Subscriptions' } })]);
  });

  it('health check reports the adapter state; a failing Mercury token fails only that connection', async () => {
    await addMercury();
    expect(await (await getAdapter('conn_mercury')).health()).toMatchObject({ ok: true });
    ctx.mercury.failing = true;
    expect(await (await getAdapter('conn_mercury')).health()).toMatchObject({ ok: false });
    const r = await pullEntries({ wait: true });
    expect(r.pulled).toBe(23);
    expect((r as { errors?: string[] }).errors?.[0]).toMatch(/Mercury: Mercury 401/);
    expect((await listConnections()).find((c) => c.id === 'conn_mercury')!.lastError).toMatch(/401/);
  });
});
