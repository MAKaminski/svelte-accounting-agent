// MW.entry.research — Tier 0 lookups that become evidence rows. Only an unknown merchant reaches a model
// (AI.merchant.identify). A failing source is noted and research continues (partial, never blocking).
import { and, eq, inArray, ne, notInArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { getPorts } from '../ports';
import { newId, nowIso, normalizeMerchant, trigramSimilarity, fmtCents } from '../util';
import type { EvidenceKind } from '../db/schema';
import { classifyTxKind, MCC, PAYOUT_AMOUNT_TOLERANCE_CENTS, PAYOUT_DATE_TOLERANCE_DAYS } from './rules';
import { identifyMerchant } from './identify';
import { accountNames } from './view';
import { isEnabled } from '../components';
import type { Line } from '$lib/types';

export interface EvidenceDraft { kind: EvidenceKind; reference: string | null; summary: string; payoutRowId?: string }

/** The coding an entry ended up with: Slash raw coding for synced history, else our last approval. */
export function codingOf(entryId: string): Line[] | null {
  const db = getDb();
  const e = db.select().from(schema.accountingEntries).where(eq(schema.accountingEntries.id, entryId)).get();
  if (!e) return null;
  const raw = JSON.parse(e.rawJson) as { amountCents: number; dimensions?: Record<string, string>; lineItems?: { amountCents: number; dimensions?: Record<string, string> }[] };
  if (raw.lineItems?.length) return raw.lineItems.filter((l) => l.dimensions?.account).map((l) => ({ valueId: l.dimensions!.account, amountCents: l.amountCents }));
  if (raw.dimensions?.account && e.localState !== 'fetched' && e.localState !== 'researched' && e.localState !== 'recommended') {
    return [{ valueId: raw.dimensions.account, amountCents: raw.amountCents }];
  }
  return null;
}

function historyEntryIds(merchantId: string | null, description: string, selfId: string): string[] {
  const db = getDb();
  const done = ['coded', 'ready', 'synced'] as const;
  if (merchantId) {
    return db.select({ id: schema.accountingEntries.id }).from(schema.accountingEntries)
      .innerJoin(schema.slashTransactions, eq(schema.slashTransactions.accountingEntryId, schema.accountingEntries.id))
      .where(and(eq(schema.slashTransactions.merchantId, merchantId), inArray(schema.accountingEntries.localState, [...done]), ne(schema.accountingEntries.id, selfId)))
      .all().map((r) => r.id);
  }
  const norm = normalizeMerchant(description);
  if (!norm) return [];
  return db.select({ id: schema.accountingEntries.id, d: schema.slashTransactions.description }).from(schema.accountingEntries)
    .innerJoin(schema.slashTransactions, eq(schema.slashTransactions.accountingEntryId, schema.accountingEntries.id))
    .where(and(inArray(schema.accountingEntries.localState, [...done]), ne(schema.accountingEntries.id, selfId)))
    .all().filter((r) => normalizeMerchant(r.d) === norm).map((r) => r.id);
}

/** New merchant = no Slash history and no QuickBooks vendor match. */
export async function isNewMerchant(merchantId: string, name: string): Promise<boolean> {
  if (historyEntryIds(merchantId, '', '__none__').length) return false;
  try {
    const vendors = await getPorts().qbo.listVendors();
    return !vendors.some((v) => trigramSimilarity(v.name, name) >= 0.6);
  } catch { return true; }
}

function summarizeHistory(label: string, ids: string[]): EvidenceDraft | null {
  if (!ids.length) return null;
  const names = accountNames();
  const counts = new Map<string, number>();
  let split = 0;
  for (const id of ids) {
    const c = codingOf(id);
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
  const e = db.select().from(schema.accountingEntries).where(eq(schema.accountingEntries.id, entryId)).get();
  const t = db.select().from(schema.slashTransactions).where(eq(schema.slashTransactions.accountingEntryId, entryId)).get();
  if (!e || !t) throw new Error(`entry ${entryId} has no transaction`);
  const drafts: EvidenceDraft[] = [];
  const notes: string[] = [];
  const label = t.merchantName ?? t.description;
  const kind = classifyTxKind(t.description, !!t.merchantId);

  // 1. Slash history (rule)
  const hist = summarizeHistory(label, historyEntryIds(t.merchantId, t.description, entryId));
  if (hist) drafts.push(hist);

  // 2. QuickBooks history by vendor name, trigram ≥ 0.6 (rule)
  let qboHit = false;
  if (kind === 'card' && !isEnabled('qbo.read')) notes.push('QuickBooks lookup (qbo.read) is switched off');
  if (kind === 'card' && isEnabled('qbo.read')) {
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
    const rows = db.select().from(schema.payoutRows).all();
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
  db.transaction(() => {
    // Rerunnable: replace everything except owner answers (those are permanent evidence).
    db.delete(schema.evidence).where(and(eq(schema.evidence.entryId, entryId), notInArray(schema.evidence.kind, ['owner_answer']))).run();
    for (const d of drafts) {
      db.insert(schema.evidence).values({ id: newId('ev'), entryId, kind: d.kind, reference: d.reference, payoutRowId: d.payoutRowId ?? null, summary: d.summary, createdAt: nowIso() }).run();
    }
    db.update(schema.accountingEntries).set({ localState: 'researched', stateReason: notes.length ? notes.join('; ') : null, updatedAt: nowIso() })
      .where(eq(schema.accountingEntries.id, entryId)).run();
  });
  return { payoutMatched, notes };
}
