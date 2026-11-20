// MW.coa.pull — chart of accounts per source:
//  - 'slash': account dimension values from each Slash-like connection (capabilities.chart === 'ledger')
//  - 'qbo'  : QuickBooks accounts (MW.qbo.accounts) when any connection codes against QuickBooks directly
import { getDb, schema } from '../db';
import { getPorts } from '../ports';
import { nowIso } from '../util';
import { withRun } from './runs';
import { capabilitiesOf, getAdapter, listConnections } from '../ledgers/registry';

const EXPENSE_INCOME = new Set(['Expense', 'Income', 'Other Income', 'Other Expense', 'Cost of Goods Sold', 'Other Current Asset', 'Equity', 'Fixed Asset']);

export async function pullCoa(opts: { dryRun?: boolean; includeQbo?: boolean } = {}) {
  return withRun('MW.coa.pull', null, async () => {
    const conns = listConnections();
    const accounts: { id: string; name: string; enabled: boolean; source: 'slash' | 'qbo'; qboAccountId: string | null }[] = [];
    // Slash charts (inactive connections too: their history still needs names)
    for (const c of conns.filter((x) => capabilitiesOf(x).chart === 'ledger')) {
      const a = getAdapter(c.id);
      if (!a.listAccounts) continue;
      for (const v of await a.listAccounts()) accounts.push({ id: v.id, name: v.name, enabled: v.enabled, source: 'slash', qboAccountId: null });
    }
    if (opts.includeQbo || conns.some((x) => capabilitiesOf(x).chart === 'qbo')) accounts.push(...(await pullQboAccounts()));
    if (!opts.dryRun) {
      const db = getDb();
      for (const a of accounts) {
        const v = { id: a.id, dimension: 'account', name: a.name, enabled: a.enabled, source: a.source, qboAccountId: a.qboAccountId, updatedAt: nowIso() };
        db.insert(schema.dimensionValues).values(v).onConflictDoUpdate({ target: schema.dimensionValues.id, set: v }).run();
      }
    }
    return { accounts: accounts.map(({ id, name, enabled }) => ({ id, name, enabled })), dryRun: !!opts.dryRun };
  });
}

/** MW.qbo.accounts — the QuickBooks chart as coding targets (`qbo:<Id>`); bank accounts are kept, disabled, for mapping. */
async function pullQboAccounts() {
  return withRun('MW.qbo.accounts', null, async () => {
    const rows = await getPorts().qbo.listAccounts();
    return rows.map((r) => ({
      id: `qbo:${r.id}`, name: r.name, qboAccountId: r.id, source: 'qbo' as const,
      enabled: r.active && EXPENSE_INCOME.has(r.type) && !/^uncategorized|ask my accountant/i.test(r.name)
    }));
  });
}

export function enabledAccounts(source: 'slash' | 'qbo' = 'slash') {
  return getDb().select().from(schema.dimensionValues).all().filter((d) => d.enabled && d.dimension === 'account' && d.source === source);
}

export function bankAccountsFromQbo() {
  return getPorts().qbo.listAccounts().then((rows) => rows.filter((r) => r.type === 'Bank' || r.type === 'Credit Card'));
}
