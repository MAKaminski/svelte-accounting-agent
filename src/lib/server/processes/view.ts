// Read models: DB rows → the shared return schemas (src/lib/types.ts).
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import type { Entry, EntryDetail, Recommendation, Line } from '$lib/types';

export function accountNames(): Map<string, string> {
  return new Map(getDb().select().from(schema.dimensionValues).all().map((d) => [d.id, d.name]));
}

export function recView(r: typeof schema.recommendations.$inferSelect, names = accountNames()): Recommendation {
  const lines = JSON.parse(r.linesJson) as Line[];
  return {
    id: r.id, entryId: r.entryId, action: r.action, memo: r.memo, confidence: r.confidence, reasoning: r.reasoning,
    question: r.question, model: r.model, promptVersion: r.promptVersion, costUsd: r.costUsd,
    lines: lines.map((l) => ({ ...l, accountName: names.get(l.valueId) ?? l.valueId })),
    tokens: { fresh: r.tokensFresh, cacheWrite: r.tokensCacheWrite, cacheRead: r.tokensCacheRead, out: r.tokensOut },
    ttftMs: r.ttftMs, e2eMs: r.e2eMs, shadowAutoApprove: r.shadowAutoApprove, createdAt: r.createdAt
  };
}

export function latestRec(entryId: string) {
  return getDb().select().from(schema.recommendations).where(eq(schema.recommendations.entryId, entryId))
    .orderBy(desc(schema.recommendations.createdAt)).limit(1).get() ?? null;
}

export function listEntries(state?: string): Entry[] {
  const db = getDb();
  const rows = state
    ? db.select().from(schema.accountingEntries).where(eq(schema.accountingEntries.localState, state as never)).all()
    : db.select().from(schema.accountingEntries).where(inArray(schema.accountingEntries.slashStatus, ['in_review', 'ready_to_sync', 'pending_sync', 'syncing', 'failed'])).all();
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const txs = new Map(db.select().from(schema.slashTransactions).where(inArray(schema.slashTransactions.accountingEntryId, ids)).all().map((t) => [t.accountingEntryId, t]));
  const recs = new Map<string, typeof schema.recommendations.$inferSelect>();
  for (const r of db.select().from(schema.recommendations).where(inArray(schema.recommendations.entryId, ids)).orderBy(schema.recommendations.createdAt).all()) recs.set(r.entryId, r);
  const qs = new Map(db.select().from(schema.questions).where(and(inArray(schema.questions.entryId, ids), eq(schema.questions.status, 'open'))).all().map((q) => [q.entryId, q.id]));
  const names = accountNames();
  return rows.map((e) => {
    const t = txs.get(e.id);
    const r = recs.get(e.id);
    return {
      id: e.id, slashStatus: e.slashStatus, state: e.localState, stateReason: e.stateReason, amountCents: e.amountCents, memo: e.memo,
      date: t?.date ?? null, description: t?.description ?? null, merchantId: t?.merchantId ?? null, merchantName: t?.merchantName ?? null,
      mcc: t?.mcc ?? null, pendingUntil: e.pendingUntil, openQuestionId: qs.get(e.id) ?? null, recommendation: r ? recView(r, names) : null
    };
  }).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id.localeCompare(a.id));
}

export function getEntry(id: string): EntryDetail | null {
  const db = getDb();
  const e = db.select().from(schema.accountingEntries).where(eq(schema.accountingEntries.id, id)).get();
  if (!e) return null;
  const base = listEntriesById([id])[0];
  const evidence = db.select().from(schema.evidence).where(eq(schema.evidence.entryId, id)).orderBy(schema.evidence.createdAt).all()
    .map((x) => ({ id: x.id, kind: x.kind, reference: x.reference, summary: x.summary }));
  const recIds = db.select({ id: schema.recommendations.id }).from(schema.recommendations).where(eq(schema.recommendations.entryId, id)).all().map((r) => r.id);
  const decisions = recIds.length
    ? db.select().from(schema.decisions).where(inArray(schema.decisions.recommendationId, recIds)).orderBy(schema.decisions.decidedAt).all()
      .map((d) => ({ id: d.id, action: d.action, decidedBy: d.decidedBy, decidedAt: d.decidedAt }))
    : [];
  return { ...base, evidence, decisions };
}

function listEntriesById(ids: string[]): Entry[] {
  // Reuse listEntries' mapping for one row regardless of its state.
  const db = getDb();
  const e = db.select().from(schema.accountingEntries).where(inArray(schema.accountingEntries.id, ids)).all();
  return e.length ? listEntries(e[0].localState).filter((x) => ids.includes(x.id)) : [];
}
