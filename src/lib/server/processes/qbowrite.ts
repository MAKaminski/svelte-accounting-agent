// MW.qbo.write — the write path for ledgers with capabilities.code === 'qbo_direct' (Mercury).
// rule: map bank + accounts → rule: dedupe against existing QuickBooks transactions (same bank, amount, ±3 days)
//   → create (requestid = decision id) | update an uncategorized match | stop on a conflicting match.
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { getPorts } from '../ports';
import { nowIso } from '../util';
import type { Line } from '$lib/types';
import type { LedgerItem } from '../ledgers/types';
import { configOf, getAdapter, getConnection } from '../ledgers/registry';
import { isEnabled } from '../components';
import { withRun } from './runs';
import { accountNames } from './view';

const UNCATEGORIZED = /uncategorized|ask my accountant/i;
export const DEDUPE_DAYS = 3;
export const qboMarker = (decisionId: string) => `LaceLuxx Books ${decisionId}`;

type Outcome = { state: 'ready' | 'recommended' | 'invalid' | 'approved'; reason: string | null; qboTxnId?: string; qboTxnType?: string; retry?: boolean };

export async function writeToQbo(entryId: string, decision: { id: string; finalLinesJson: string | null; finalMemo: string | null }): Promise<Outcome> {
  const db = getDb();
  const e = (await db.select().from(schema.ledgerItems).where(eq(schema.ledgerItems.id, entryId)).get())!;
  const conn = await getConnection(e.connectionId);
  const item = JSON.parse(e.rawJson) as LedgerItem;
  const lines = JSON.parse(decision.finalLinesJson ?? '[]') as Line[];

  // rule: mappings
  const bankAccountId = configOf(conn).qboBankAccountIdByAccount?.[item.tx.accountId ?? ''];
  if (!bankAccountId) return { state: 'recommended', reason: `QUICKBOOKS: no QuickBooks bank account mapped for ${conn.name} account ${item.tx.accountId ?? '?'} (set it in /ledgers)` };
  const dims = new Map((await db.select().from(schema.dimensionValues).all()).map((d) => [d.id, d]));
  const qLines = [] as { accountId: string; amountCents: number; description?: string }[];
  for (const l of lines) {
    const d = dims.get(l.valueId);
    if (!d?.qboAccountId) return { state: 'recommended', reason: `QUICKBOOKS: ${l.valueId} is not a QuickBooks account; recode against the QuickBooks chart` };
    qLines.push({ accountId: d.qboAccountId, amountCents: Math.abs(l.amountCents), description: l.description });
  }
  const type: 'Purchase' | 'Deposit' = e.amountCents < 0 ? 'Purchase' : 'Deposit';
  const writer = getPorts().qboWriter;
  const marker = qboMarker(decision.id);

  return withRun('MW.qbo.write', entryId, async () => {
    try {
      // rule: dedupe
      const candidates = await writer.findCandidates({ bankAccountId, amountCents: e.amountCents, date: item.tx.date, days: DEDUPE_DAYS });
      const ours = candidates.find((c) => c.privateNote === marker);
      if (ours) return { state: 'ready', reason: null, qboTxnId: ours.id, qboTxnType: ours.type };
      // Another item's LaceLuxx write is not a duplicate of this one (recurring same-amount charges).
      const match = candidates.find((c) => !c.privateNote?.startsWith('LaceLuxx Books '));
      if (match) {
        const wanted = [...qLines.map((l) => l.accountId)].sort().join(',');
        const has = [...match.lines.map((l) => l.accountId)].sort().join(',');
        if (match.lines.length && match.lines.every((l) => UNCATEGORIZED.test(l.accountName))) {
          const updated = await writer.updateLineAccounts(match, qLines, `${decision.id}:update`);
          return { state: 'ready', reason: `Matched QuickBooks ${match.type} ${match.id} (was uncategorized) and recoded it`, qboTxnId: updated.id, qboTxnType: updated.type };
        }
        if (wanted === has) return { state: 'ready', reason: `Already in QuickBooks as ${match.type} ${match.id} with the same account; nothing written`, qboTxnId: match.id, qboTxnType: match.type };
        const names = await accountNames();
        return { state: 'invalid', reason: `QUICKBOOKS: ${match.type} ${match.id} on ${match.date} already codes this to ${match.lines.map((l) => l.accountName).join(' / ')}, not ${lines.map((l) => names.get(l.valueId) ?? l.valueId).join(' / ')}. Fix it in QuickBooks or edit the coding here.` };
      }
      // rule: create, idempotent via requestid
      const created = await writer.create({ type, bankAccountId, date: item.tx.date, lines: qLines, privateNote: marker, payeeName: item.tx.merchant?.name }, decision.id);
      return { state: 'ready', reason: null, qboTxnId: created.id, qboTxnType: created.type };
    } catch (err) {
      return { state: 'approved', reason: `QUICKBOOKS: ${(err as Error).message}; retrying in 60 s`, retry: true };
    }
  });
}

/** MW.ledger.annotate — optional note on the ledger's own transaction (Mercury PATCH note). Off by default. */
export async function annotateLedger(entryId: string, text: string) {
  const db = getDb();
  const e = (await db.select().from(schema.ledgerItems).where(eq(schema.ledgerItems.id, entryId)).get())!;
  if (!await isEnabled('MW.ledger.annotate') || !await isEnabled('mercury.annotate')) return;
  const a = await getAdapter(e.connectionId);
  if (!a.capabilities.annotate || !a.annotate) return;
  try { await withRun('MW.ledger.annotate', entryId, () => a.annotate!(e.externalId, text, `${entryId}:annotate`)); }
  catch (err) {
    await db.update(schema.ledgerItems).set({ stateReason: `Coded in QuickBooks; ledger note failed — ${(err as Error).message}`, updatedAt: nowIso() }).where(eq(schema.ledgerItems.id, entryId)).run();
  }
}
