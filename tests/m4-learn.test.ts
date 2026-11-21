import { describe, it, expect, beforeEach } from 'vitest';
import { setup } from './helpers';
import { pullEntries } from '../src/lib/server/processes/pull';
import { approve, undo } from '../src/lib/server/processes/decide';
import { listMappings, applyMapping } from '../src/lib/server/processes/mappings';
import { getEntry, listEntries } from '../src/lib/server/processes/view';

const uspsIds = async () => (await listEntries()).filter((e) => e.merchantName === 'USPS PO 1234' && e.state === 'recommended').map((e) => e.id);

describe('M4 · learn rules', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { ctx = await setup(); await pullEntries({ wait: true }); });

  it('3 consistent approvals → a proposal; undo withdraws it', async () => {
    const ids = await uspsIds();
    expect(ids).toHaveLength(3);
    await approve(ids[0], {});
    await approve(ids[1], {});
    expect(await listMappings('proposed')).toHaveLength(0);
    await approve(ids[2], { later: true });
    const [p] = await listMappings('proposed');
    expect(p).toMatchObject({ sourceId: 'mer_usps', valueId: 'dv_shipping', supportCount: 3 });
    await undo(ids[2]);
    expect(await listMappings('proposed')).toHaveLength(0);
  });

  it('applying the rule writes the Slash mapping; the next USPS entry is coded by Slash (Tier 0, no model call)', async () => {
    for (const id of await uspsIds()) await approve(id, {});
    const [p] = await listMappings('proposed');
    await expect(applyMapping(p.id, {})).rejects.toThrow(/--yes/);
    await applyMapping(p.id, { yes: true });
    expect(ctx.slash.writes.find((w) => w.op === 'upsertMapping')).toMatchObject({ id: 'mer_usps', body: { valueId: 'dv_shipping', applyToExistingEntries: true } });

    ctx.slash.addEntry(
      { id: 'ae_9001', status: 'in_review', amountCents: -1105, memo: null, transactionId: 'tx_9001', createdAt: '2026-11-18T14:00:00.000Z' },
      { id: 'tx_9001', date: '2026-11-18', description: 'USPS PO 1234', amountCents: -1105, accountingEntryId: 'ae_9001',
        cardDetails: { merchant: { id: 'mer_usps', description: 'USPS PO 1234', categoryCode: '9402', categoryId: 'cat_postal' } } }
    );
    const callsBefore = ctx.model.calls.length;
    await pullEntries({ wait: true });
    const e = (await getEntry('ae_9001'))!;
    expect(e.recommendation).toMatchObject({ model: 'rules:mapping', confidence: 0.99 });
    expect(e.recommendation!.lines[0].valueId).toBe('dv_shipping');
    expect(ctx.model.calls.length).toBe(callsBefore);
  });

  it('conflicting approvals never produce a proposal', async () => {
    const ids = await uspsIds();
    await approve(ids[0], {});
    await approve(ids[1], { lines: [{ valueId: 'dv_supplies', amountCents: (await getEntry(ids[1]))!.amountCents }] });
    await approve(ids[2], {});
    expect(await listMappings('proposed')).toHaveLength(0);
  });
});
