// MW.entry.research — Tier 0 lookups that become evidence rows. Only an unknown merchant reaches a model
// (AI.merchant.identify). A failing source is noted and research continues (partial, never blocking).
import { and, desc, eq, inArray, ne, notInArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { getPorts } from '../ports';
import { newId, nowIso, normalizeMerchant, trigramSimilarity, fmtCents } from '../util';
import type { Capabilities, EvidenceKind } from '../db/schema';
import type { LedgerItem } from '../ledgers/types';
import { classifyTxKind, type TxKind, MCC, PAYOUT_AMOUNT_TOLERANCE_CENTS, PAYOUT_DATE_TOLERANCE_DAYS } from './rules';
import { identifyMerchant } from './identify';
import { accountNames } from './view';
import { isEnabled } from '../components';
import type { Line } from '$lib/types';

export interface EvidenceDraft { kind: EvidenceKind; reference: string | null; summary: string; payoutRowId?: string }

/** Transaction kind: the ledger's hint (e.g. Mercury internalTransfer) wins over the description rules. */
export function txKindOf(t: { description: string; merchantId: string | null; kindHint: string | null } | undefined): TxKind {
  if (!t) return 'other';
  return (t.kindHint as TxKind | null) ?? classifyTxKind(t.description, !!t.merchantId);
}

/** Resolve a ledger-reported account name to our valueId within a chart source. */
export async function valueIdForName(name: string, source: 'slash' | 'qbo'): Promise<string | null> {
  const n = name.trim().toLowerCase();
  const hit = (await getDb().select().from(schema.dimensionValues).all()).find((d) => d.source === source && d.name.trim().toLowerCase() === n);
  return hit?.id ?? null;
}

/** The coding an entry ended up with: our last approval if we coded it, else the ledger's own coding (history). */
export async function codingOf(entryId: string): Promise<Line[] | null> {
  const db = getDb();
  const e = await db.select().from(schema.ledgerItems).where(eq(schema.ledgerItems.id, entryId)).get();
  if (!e) return null;
  if (['approved', 'coded', 'ready', 'synced'].includes(e.localState)) {
    const recIds = (await db.select({ id: schema.recommendations.id }).from(schema.recommendations).where(eq(schema.recommendations.entryId, entryId)).all()).map((r) => r.id);
    if (recIds.length) {
      const d = (await db.select().from(schema.decisions).where(inArray(schema.decisions.recommendationId, recIds)).orderBy(desc(schema.decisions.decidedAt)).all())
        .find((x) => x.action === 'approved' || x.action === 'edited');
      if (d?.finalLinesJson) return JSON.parse(d.finalLinesJson) as Line[];
    }
  }
  if (e.localState !== 'synced' && e.localState !== 'ready' && e.localState !== 'coded') return null;
  const item = JSON.parse(e.rawJson) as LedgerItem;
  if (!item.coding?.length) return null;
  const conn = await db.select().from(schema.ledgerConnections).where(eq(schema.ledgerConnections.id, e.connectionId)).get();
  const source = conn && (JSON.parse(conn.capabilitiesJson) as Capabilities).chart === 'qbo' ? 'qbo' : 'slash';
  const lines: Line[] = [];
  for (const l of item.coding) {
    const valueId = l.valueId ?? (l.accountName ? await valueIdForName(l.accountName, source) : null);
    if (!valueId) continue;
    lines.push({ valueId, amountCents: l.amountCents });
  }
  return lines.length ? lines : null;
}

async function historyEntryIds(merchantId: string | null, description: string, selfId: string): Promise<string[]> {
  const db = getDb();
  const done = ['coded', 'ready', 'synced'] as const;
  if (merchantId) {
    return (await db.select({ id: schema.ledgerItems.id }).from(schema.ledgerItems)
      .innerJoin(schema.ledgerTransactions, eq(schema.ledgerTransactions.itemId, schema.ledgerItems.id))
      .where(and(eq(schema.ledgerTransactions.merchantId, merchantId), inArray(schema.ledgerItems.localState, [...done]), ne(schema.ledgerItems.id, selfId)))
      .all()).map((r) => r.id);
  }
  const norm = normalizeMerchant(description);
  if (!norm) return [];
  return (await db.select({ id: schema.ledgerItems.id, d: schema.ledgerTransactions.description }).from(schema.ledgerItems)
    .innerJoin(schema.ledgerTransactions, eq(schema.ledgerTransactions.itemId, schema.ledgerItems.id))
    .where(and(inArray(schema.ledgerItems.localState, [...done]), ne(schema.ledgerItems.id, selfId)))
    .all()).filter((r) => normalizeMerchant(r.d) === norm).map((r) => r.id);
}

/** New merchant = no Slash history and no QuickBooks vendor match. */
export async function isNewMerchant(merchantId: string, name: string): Promise<boolean> {
  if ((await historyEntryIds(merchantId, '', '__none__')).length) return false;
  try {
    const vendors = await getPorts().qbo.listVendors();
    return !vendors.some((v) => trigramSimilarity(v.name, name) >= 0.6);
  } catch { return true; }
}

async function summarizeHistory(label: string, ids: string[]): Promise<EvidenceDraft | null> {
  if (!ids.length) return null;
  const names = await accountNames();
  const counts = new Map<string, number>();
  let split = 0;
  for (const id of ids) {
    const c = await codingOf(id);
    if (!c?.length) continue;
    if (c.length > 1) { split++; const key = 'split: ' + c.map((l) => names.get(l.valueId) ?? l.valueId).join(' / '); counts.set(key, (counts.get(key) ?? 0) + 1); continue; }
    const n = names.get(c[0].valueId) ?? c[0].valueId;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  if (!counts.size) return null;
  const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n, k]) => `${k}× ${n}`);
  return { kind: 'slash_history', reference: ids.slice(0, 5).join(','), summary: `${ids.length} prior entries from ${label}: ${parts.join(', ')}` };
}

export async function gatherEvidence(entryId: string): Promise<{ drafts: EvidenceDraft[]; notes: string[]; payoutMatched: boolean }> {
  const db = getDb();
  const e = await db.select().from(schema.ledgerItems).where(eq(schema.ledgerItems.id, entryId)).get();
  const t = await db.select().from(schema.ledgerTransactions).where(eq(schema.ledgerTransactions.itemId, entryId)).get();
  if (!e || !t) throw new Error(`entry ${entryId} has no transaction`);
  const drafts: EvidenceDraft[] = [];
  const notes: string[] = [];
  const label = t.merchantName ?? t.description;
  const kind = txKindOf(t);

  // 1. Slash history (rule)
  const hist = await summarizeHistory(label, await historyEntryIds(t.merchantId, t.description, entryId));
  if (hist) drafts.push(hist);

  // 2. QuickBooks history by vendor name, trigram ≥ 0.6 (rule)
  let qboHit = false;
  if (kind === 'card' && !await isEnabled('qbo.read')) notes.push('QuickBooks lookup (qbo.read) is switched off');
  if (kind === 'card' && await isEnabled('qbo.read')) {
    try {
      const { qbo } = getPorts();
      const vendors = await qbo.listVendors();
      const best = vendors.map((v) => ({ v, s: trigramSimilarity(v.name, label) })).sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0.6) {
        const purchases = await qbo.purchasesByVendor(best.v.id);
        if (purchases.length) {
          qboHit = true;
          const counts = new Map<string, number>();
          for (const p of purchases) counts.set(p.accountName, (counts.get(p.accountName) ?? 0) + 1);
          drafts.push({ kind: 'qbo_history', reference: best.v.id,
            summary: `QuickBooks vendor "${best.v.name}" (match ${best.s.toFixed(2)}): ${purchases.length} purchases — ${[...counts].map(([a, k]) => `${k}× ${a}`).join(', ')}` });
        }
      }
    } catch (err) {
      notes.push(`QuickBooks unavailable: ${(err as Error).message}`);
    }
  }

  // 3. MCC table (rule)
  if (t.mcc) {
    const m = MCC[t.mcc];
    drafts.push({ kind: 'mcc', reference: t.mcc, summary: m ? `MCC ${t.mcc} ${m.label} (usually ${m.hint})` : `MCC ${t.mcc} (not in table)` });
  }

  // 4. Payout match: amount ± $0.01, date ± 3 days (rule)
  let payoutMatched = false;
  if (e.amountCents > 0) {
    const rows = await db.select().from(schema.payoutRows).all();
    const day = 86_400_000;
    const hit = rows.find((r) => Math.abs(r.netCents - e.amountCents) <= PAYOUT_AMOUNT_TOLERANCE_CENTS
      && Math.abs(Date.parse(r.date) - Date.parse(t.date)) <= PAYOUT_DATE_TOLERANCE_DAYS * day);
    if (hit) {
      payoutMatched = true;
      drafts.push({ kind: 'payout_row', reference: hit.payoutId, payoutRowId: hit.id,
        summary: `${hit.channel} ${hit.payoutId} ${hit.date}: gross ${fmtCents(hit.grossCents)}, fees ${fmtCents(-hit.feesCents)}, shipping ${fmtCents(-hit.shippingCents)}, net ${fmtCents(hit.netCents)} (lines in cents: sales ${hit.grossCents}, fees ${-hit.feesCents}, shipping ${-hit.shippingCents})` });
    } else if (kind === 'payout') {
      notes.push('Payout with no matching payout row — import the payout CSV in Settings');
    }
  }

  // 5. Unknown merchant → AI.merchant.identify (judgment, Tier 1/2)
  if (!hist && !qboHit && kind === 'card' && t.merchantName) {
    const profile = await identifyMerchant({ merchantName: t.merchantName, mcc: t.mcc, description: t.description }, entryId);
    drafts.push({ kind: 'merchant_profile', reference: profile.model, summary: `${profile.kind} (${profile.confidence.toFixed(2)}): ${profile.summary}` });
  }
  return { drafts, notes, payoutMatched };
}

export async function researchEntry(entryId: string) {
  const { drafts, notes, payoutMatched } = await gatherEvidence(entryId);
  const db = getDb();
  await db.transaction(async (tx) => {
    // Rerunnable: replace everything except owner answers (those are permanent evidence).
    await tx.delete(schema.evidence).where(and(eq(schema.evidence.entryId, entryId), notInArray(schema.evidence.kind, ['owner_answer']))).run();
    for (const d of drafts) {
      await tx.insert(schema.evidence).values({ id: newId('ev'), entryId, kind: d.kind, reference: d.reference, payoutRowId: d.payoutRowId ?? null, summary: d.summary, createdAt: nowIso() }).run();
    }
    await tx.update(schema.ledgerItems).set({ localState: 'researched', stateReason: notes.length ? notes.join('; ') : null, updatedAt: nowIso() })
      .where(eq(schema.ledgerItems.id, entryId)).run();
  });
  return { payoutMatched, notes };
}
