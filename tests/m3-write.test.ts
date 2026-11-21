import { describe, it, expect, beforeEach } from 'vitest';
import { setup } from './helpers';
import { pullEntries } from '../src/lib/server/processes/pull';
import { approve, undo, ask, reject, commitDue } from '../src/lib/server/processes/decide';
import { answerQuestion } from '../src/lib/server/processes/questions';
import { getEntry, listEntries } from '../src/lib/server/processes/view';
import { SlashHttpError } from '../src/lib/server/slash';

const byMerchant = async (name: string) => (await listEntries()).find((e) => (e.merchantName ?? e.description) === name)!;
const usps = async () => (await listEntries()).filter((e) => e.merchantName === 'USPS PO 1234').sort((a, b) => a.id.localeCompare(b.id))[0];

describe('M3 · write path', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { ctx = await setup(); await pullEntries({ wait: true }); });

  it('approve now: PATCH coding + mark-ready, each with an idempotency key → Slash ready_to_sync', async () => {
    const id = (await usps()).id;
    const d = await approve(id, {});
    expect(d.state).toBe('ready');
    const writes = ctx.slash.writes.filter((w) => w.id === id);
    expect(writes.map((w) => w.op)).toEqual(['updateEntry', 'markReady']);
    expect(writes[0].body).toMatchObject({ dimensions: { account: 'dv_shipping' } });
    expect(writes[0].idempotencyKey).toBe(`${d.id}:code`);
    expect(writes[1].idempotencyKey).toBe(`${d.id}:ready`);
    expect(ctx.slash.entries.find((e) => e.id === id)!.status).toBe('ready_to_sync');
  });

  it('approve later + undo inside the window: no Slash write', async () => {
    const id = (await usps()).id;
    const d = await approve(id, { later: true });
    expect(d.state).toBe('approved');
    await commitDue();
    expect(ctx.slash.writes).toHaveLength(0);
    const u = await undo(id);
    expect(u.state).toBe('recommended');
    expect(ctx.slash.writes).toHaveLength(0);
  });

  it('approve later: commits once the window passes', async () => {
    process.env.UNDO_WINDOW_MS = '0';
    const id = (await usps()).id;
    await approve(id, { later: true });
    await new Promise((r) => setTimeout(r, 5));
    await commitDue();
    expect((await getEntry(id))!.state).toBe('ready');
    expect(ctx.slash.writes.map((w) => w.op)).toEqual(['updateEntry', 'markReady']);
    delete process.env.UNDO_WINDOW_MS;
  });

  it('an open question blocks approve unless --override', async () => {
    const id = (await byMerchant('AMZN Mktp US')).id;
    await ask(id, {});
    await expect(approve(id, { lines: [{ valueId: 'dv_supplies', amountCents: -21237 }] })).rejects.toThrow(/open question/);
  });

  it('a question recommendation cannot be approved without lines', async () => {
    await expect(approve((await byMerchant('AMZN Mktp US')).id, {})).rejects.toThrow(/question, not a coding/);
  });

  it('edit and approve: edited lines are validated and recorded as "edited"', async () => {
    const id = (await byMerchant('AMZN Mktp US')).id;
    await expect(approve(id, { lines: [{ valueId: 'dv_supplies', amountCents: -100 }] })).rejects.toThrow(/sum/);
    await expect(approve(id, { lines: [{ valueId: 'dv_misc_old', amountCents: -21237 }] })).rejects.toThrow(/not an enabled account/);
    const d = await approve(id, { lines: [{ valueId: 'dv_supplies', amountCents: -21237 }] });
    expect(d.action).toBe('edited');
    expect(d.state).toBe('ready');
  });

  it('transfers cannot be coded even with hand-entered lines (without override)', async () => {
    const id = (await byMerchant('Book transfer from Slash Checking 4421')).id;
    await expect(approve(id, { lines: [{ valueId: 'dv_sales', amountCents: 50000 }] })).rejects.toThrow(/transfer/);
  });

  it('ask → answer → re-recommended with the owner answer as evidence', async () => {
    const id = (await byMerchant('AMZN Mktp US')).id;
    const q = await ask(id, {});
    expect((await getEntry(id))!.state).toBe('asked');
    await answerQuestion(q.id, 'Packing tape and mailers — supplies', { wait: true });
    const e = (await getEntry(id))!;
    expect(e.evidence.some((x) => x.kind === 'owner_answer')).toBe(true);
    expect(['recommended', 'invalid']).toContain(e.state);
    expect(e.openQuestionId).toBeNull();
  });

  it('409 sync in progress → stays approved and retries in 60 s', async () => {
    const id = (await usps()).id;
    ctx.slash.failNext.updateEntry = new SlashHttpError(409, 'entry_sync_in_progress', 'syncing');
    const d = await approve(id, {});
    expect(d.state).toBe('approved');
    expect((await getEntry(id))!.stateReason).toMatch(/retrying in 60 s/);
  });

  it('400 from Slash → back to recommended with the error shown', async () => {
    const id = (await usps()).id;
    ctx.slash.failNext.updateEntry = new SlashHttpError(400, 'invalid', 'bad dimension');
    const d = await approve(id, {});
    expect(d.state).toBe('recommended');
    expect((await getEntry(id))!.stateReason).toMatch(/SLASH: coding rejected/);
  });

  it('reject needs --yes; then the entry leaves the queue', async () => {
    const id = (await byMerchant('Canva Pro')).id;
    await expect(reject(id, {})).rejects.toThrow(/--yes/);
    expect((await reject(id, { yes: true, reason: 'personal' })).state).toBe('rejected');
  });

  it('Slash sync finishing moves ready → synced on the next pull', async () => {
    const id = (await usps()).id;
    await approve(id, {});
    ctx.slash.syncAll();
    await pullEntries({ wait: true });
    expect((await getEntry(id))!.state).toBe('synced');
  });

  it('dry run approve writes nothing', async () => {
    const id = (await usps()).id;
    const d = await approve(id, { dryRun: true });
    expect(d.dryRun).toBe(true);
    expect(ctx.slash.writes).toHaveLength(0);
    expect((await getEntry(id))!.state).toBe('recommended');
  });
});
