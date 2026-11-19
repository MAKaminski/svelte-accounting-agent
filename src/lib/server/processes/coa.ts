// MW.coa.pull — upsert Slash "account" dimension values (the QuickBooks accounts Slash knows).
import { getDb, schema } from '../db';
import { getPorts } from '../ports';
import { nowIso } from '../util';
import { withRun } from './runs';

export async function pullCoa(opts: { dryRun?: boolean } = {}) {
  return withRun('MW.coa.pull', null, async () => {
    const values = await getPorts().slash.listAccountValues();
    const accounts = values.map((v) => ({ id: v.id, name: v.name, enabled: v.enabled !== false && !v.archived }));
    if (!opts.dryRun) {
      const db = getDb();
      for (const a of accounts) {
        db.insert(schema.dimensionValues).values({ id: a.id, dimension: 'account', name: a.name, enabled: a.enabled, updatedAt: nowIso() })
          .onConflictDoUpdate({ target: schema.dimensionValues.id, set: { name: a.name, enabled: a.enabled, updatedAt: nowIso() } }).run();
      }
    }
    return { accounts, dryRun: !!opts.dryRun };
  });
}

export function enabledAccounts() {
  return getDb().select().from(schema.dimensionValues).all().filter((d) => d.enabled && d.dimension === 'account');
}
