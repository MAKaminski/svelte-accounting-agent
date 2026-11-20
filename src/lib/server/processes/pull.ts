// MW.ledger.pull — for each active ledger connection: list items in review (+ history), normalize through the
// connection's adapter, upsert, then queue research → recommend for anything new or changed.
// Idempotent: a rerun changes nothing. A failing connection is recorded and the others still pull.
import { and, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { nowIso, sha256, stableJson, AppError } from '../util';
import type { LocalState } from '../db/schema';
import type { LedgerItem } from '../ledgers/types';
import { capabilitiesOf, getAdapter, listConnections, recordPull, type ConnectionRow } from '../ledgers/registry';
import { withRun } from './runs';
import { pullCoa } from './coa';
import { enqueue, drain } from './queue';
import { researchAndRecommend } from './pipeline';
import { listEntries } from './view';
import { isNewMerchant } from './research';

const PRE_DECISION: LocalState[] = ['fetched', 'researched', 'recommended', 'invalid'];

const localFor = (i: LedgerItem): LocalState => (i.status === 'in_review' ? 'fetched' : i.status === 'synced' ? 'synced' : 'ready');

export async function pullEntries(opts: { since?: string; dryRun?: boolean; wait?: boolean; connectionId?: string } = {}) {
  return withRun('MW.ledger.pull', opts.connectionId ?? null, async () => {
    const db = getDb();
    const connections = listConnections().filter((c) => c.status === 'active' && (!opts.connectionId || c.id === opts.connectionId));
    if (opts.connectionId && !connections.length) throw new AppError('not_active', `connection ${opts.connectionId} is not active (or does not exist)`, 409);
    // Load each needed chart of accounts once (Slash values; QuickBooks accounts for qbo_direct ledgers).
    const have = new Set(db.select({ s: schema.dimensionValues.source }).from(schema.dimensionValues).all().map((r) => r.s));
    if (connections.some((c) => !have.has(capabilitiesOf(c).chart === 'qbo' ? 'qbo' : 'slash'))) await pullCoa();

    let pulled = 0;
    let newMerchants = 0;
    const toProcess: string[] = [];
    const reviewIds = new Set<string>();
    const errors: string[] = [];

    for (const c of connections) {
      let items: LedgerItem[], history: LedgerItem[];
      try {
        const adapter = getAdapter(c.id);
        [items, history] = await Promise.all([adapter.listItems({ since: opts.since }), adapter.listHistory()]);
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`${c.name}: ${msg}`);
        if (!opts.dryRun) recordPull(c.id, msg);
        if (connections.length === 1) throw e;
        continue;
      }
      pulled += items.length;
      const merchants = new Map<string, string>();
      for (const i of items) if (i.tx.merchant) merchants.set(i.tx.merchant.id, i.tx.merchant.name);

      if (opts.dryRun) {
        for (const [id, name] of merchants) if (await isNewMerchant(id, name)) newMerchants++;
        continue;
      }
      upsertItems(c, [...items, ...history], toProcess);
      for (const i of items) reviewIds.add(i.externalId);
      recordPull(c.id, null);
      for (const [id, name] of merchants) if (await isNewMerchant(id, name)) newMerchants++;
    }

    if (opts.dryRun) return { pulled, newMerchants, dryRun: true, entries: [] };
    for (const id of toProcess) enqueue(() => researchAndRecommend(id));
    if (opts.wait) await drain();
    return { pulled, newMerchants, dryRun: false, entries: listEntries().filter((e) => reviewIds.has(e.id)), ...(errors.length ? { errors } : {}) };
  });
}

function upsertItems(c: ConnectionRow, all: LedgerItem[], toProcess: string[]) {
  const db = getDb();
  const existing = new Map(db.select().from(schema.ledgerItems)
    .where(and(eq(schema.ledgerItems.connectionId, c.id), inArray(schema.ledgerItems.externalId, all.map((i) => i.externalId)))).all()
    .map((r) => [r.externalId, r]));
  db.transaction(() => {
    for (const i of all) {
      const row = existing.get(i.externalId);
      const raw = stableJson(i);
      if (!row) {
        db.insert(schema.ledgerItems).values({
          id: i.externalId, connectionId: c.id, externalId: i.externalId, ledgerStatus: i.status, localState: localFor(i),
          amountCents: i.amountCents, memo: i.memo, rawJson: raw, createdAt: i.createdAt, updatedAt: nowIso()
        }).run();
        if (i.status === 'in_review') toProcess.push(i.externalId);
      } else if (sha256(row.rawJson) !== sha256(raw)) {
        let localState = row.localState;
        if (i.status === 'synced' && (localState === 'ready' || localState === 'coded')) localState = 'synced';
        // The ledger recoded it (e.g. a mapping was applied): re-research before anyone decides on stale data.
        if (i.status === 'in_review' && PRE_DECISION.includes(localState)) { localState = 'fetched'; toProcess.push(row.id); }
        db.update(schema.ledgerItems).set({ ledgerStatus: i.status, localState, rawJson: raw, amountCents: i.amountCents, updatedAt: nowIso() })
          .where(eq(schema.ledgerItems.id, row.id)).run();
      } else if (i.status === 'in_review' && row.localState === 'fetched') {
        toProcess.push(row.id); // previous pipeline run never finished
      }
      const m = i.tx.merchant;
      const tx = {
        id: `${c.id}:${i.tx.id}`, itemId: row?.id ?? i.externalId, connectionId: c.id, kindHint: i.tx.kindHint ?? null,
        date: i.tx.date, description: i.tx.description, merchantId: m?.id ?? null, merchantName: m?.name ?? null,
        mcc: m?.mcc ?? null, categoryId: m?.categoryId ?? null, amountCents: i.tx.amountCents, rawJson: stableJson(i.tx)
      };
      db.insert(schema.ledgerTransactions).values(tx).onConflictDoUpdate({ target: schema.ledgerTransactions.id, set: tx }).run();
    }
  });
}
