// MW.entries.pull — list Slash entries in review (+ synced history), upsert entries + transactions, then
// queue research → recommend for anything new or changed. Idempotent: a rerun changes nothing.
import { eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { getPorts } from '../ports';
import { nowIso, sha256, stableJson } from '../util';
import type { SlashEntry, SlashTransaction } from '../slash';
import type { LocalState } from '../db/schema';
import { withRun } from './runs';
import { pullCoa } from './coa';
import { enqueue, drain } from './queue';
import { researchAndRecommend } from './pipeline';
import { listEntries } from './view';
import { isNewMerchant } from './research';

const PRE_DECISION: LocalState[] = ['fetched', 'researched', 'recommended', 'invalid'];

export async function pullEntries(opts: { since?: string; dryRun?: boolean; wait?: boolean } = {}) {
  return withRun('MW.entries.pull', null, async () => {
    const { slash } = getPorts();
    const db = getDb();
    if (!db.select().from(schema.dimensionValues).limit(1).get()) await pullCoa();

    const inReview = await slash.listEntries({ status: 'in_review', since: opts.since });
    // Status sweep for entries we've pushed forward, plus history for research.
    const [readyRemote, synced] = await Promise.all([slash.listEntries({ status: 'ready_to_sync' }), slash.listEntries({ status: 'synced' })]);
    const all = [...inReview, ...readyRemote, ...synced];
    const txs = await slash.listTransactionsForEntries(all.map((e) => e.id));
    const txByEntry = new Map(txs.map((t) => [t.accountingEntryId!, t]));

    const merchants = new Map<string, string>();
    for (const e of inReview) { const m = txByEntry.get(e.id)?.cardDetails?.merchant; if (m?.id) merchants.set(m.id, m.description ?? m.id); }
    if (opts.dryRun) {
      let n = 0;
      for (const [id, name] of merchants) if (await isNewMerchant(id, name)) n++;
      return { pulled: inReview.length, newMerchants: n, dryRun: true, entries: [] };
    }

    const toProcess: string[] = [];
    const existing = new Map(db.select().from(schema.accountingEntries).where(inArray(schema.accountingEntries.id, all.map((e) => e.id))).all().map((r) => [r.id, r]));
    db.transaction(() => {
      for (const e of all) {
        const row = existing.get(e.id);
        const raw = stableJson(e);
        const t = txByEntry.get(e.id);
        if (!row) {
          db.insert(schema.accountingEntries).values({
            id: e.id, slashStatus: e.status, localState: e.status === 'in_review' ? 'fetched' : e.status === 'synced' ? 'synced' : 'ready',
            amountCents: e.amountCents, memo: e.memo ?? null, rawJson: raw, createdAt: e.createdAt, updatedAt: nowIso()
          }).run();
          if (e.status === 'in_review') toProcess.push(e.id);
        } else if (sha256(row.rawJson) !== sha256(raw)) {
          let localState = row.localState;
          if (e.status === 'synced' && (localState === 'ready' || localState === 'coded')) localState = 'synced';
          // Slash recoded it (e.g. a mapping was applied): re-research before anyone decides on stale data.
          const recoded = e.status === 'in_review' && PRE_DECISION.includes(localState);
          if (recoded) { localState = 'fetched'; toProcess.push(e.id); }
          db.update(schema.accountingEntries).set({ slashStatus: e.status, localState, rawJson: raw, amountCents: e.amountCents, updatedAt: nowIso() })
            .where(eq(schema.accountingEntries.id, e.id)).run();
        } else if (e.status === 'in_review' && row.localState === 'fetched') {
          toProcess.push(e.id); // previous pipeline run never finished
        }
        if (t) upsertTx(t);
      }
    });

    let newMerchants = 0;
    for (const [id, name] of merchants) if (await isNewMerchant(id, name)) newMerchants++;
    for (const id of toProcess) enqueue(() => researchAndRecommend(id));
    if (opts.wait) await drain();
    const ids = new Set(inReview.map((e) => e.id));
    return { pulled: inReview.length, newMerchants, dryRun: false, entries: listEntries().filter((e) => ids.has(e.id)) };
  });
}

function upsertTx(t: SlashTransaction) {
  const m = t.cardDetails?.merchant;
  const values = {
    id: t.id, accountingEntryId: t.accountingEntryId!, date: t.date, description: t.description,
    merchantId: m?.id ?? null, merchantName: m?.description ?? null, mcc: m?.categoryCode ?? null, categoryId: m?.categoryId ?? null,
    amountCents: t.amountCents, rawJson: stableJson(t)
  };
  getDb().insert(schema.slashTransactions).values(values).onConflictDoUpdate({ target: schema.slashTransactions.id, set: values }).run();
}

export type { SlashEntry };
