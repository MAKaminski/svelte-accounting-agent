// MW.mapping.propose (rule) and FE.mapping.apply (human confirm → Slash PUT /v2/accounting/mappings).
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { getPorts } from '../ports';
import { AppError, newId, nowIso } from '../util';
import type { Line, MappingProposal } from '$lib/types';
import { MAPPING_MIN_SUPPORT } from './rules';
import { accountNames } from './view';
import { withRun } from './runs';
import { isEnabled } from '../components';

function view(p: typeof schema.mappingProposals.$inferSelect, dryRun?: boolean): MappingProposal {
  return { ...p, accountName: accountNames().get(p.valueId) ?? p.valueId, ...(dryRun !== undefined ? { dryRun } : {}) };
}

/** 3+ approvals of the same merchant to the same single account with no conflicts → proposal. */
export function proposeMappingFor(entryId: string): void {
  if (!isEnabled('MW.mapping.propose')) return;
  const db = getDb();
  const t = db.select().from(schema.slashTransactions).where(eq(schema.slashTransactions.accountingEntryId, entryId)).get();
  if (!t?.merchantId) return;
  const entryIds = db.select({ id: schema.slashTransactions.accountingEntryId }).from(schema.slashTransactions)
    .where(eq(schema.slashTransactions.merchantId, t.merchantId)).all().map((r) => r.id);
  const recs = db.select().from(schema.recommendations).where(inArray(schema.recommendations.entryId, entryIds)).all();
  const recEntry = new Map(recs.map((r) => [r.id, r.entryId]));
  const decisions = recs.length ? db.select().from(schema.decisions).where(inArray(schema.decisions.recommendationId, recs.map((r) => r.id))).orderBy(desc(schema.decisions.decidedAt)).all() : [];
  // Latest decision per entry wins (an undo cancels the approval before it).
  const latest = new Map<string, typeof decisions[number]>();
  for (const d of decisions) { const e = recEntry.get(d.recommendationId)!; if (!latest.has(e)) latest.set(e, d); }
  const counts = new Map<string, number>();
  let conflict = false;
  for (const d of latest.values()) {
    if (d.action !== 'approved' && d.action !== 'edited') continue;
    const lines = JSON.parse(d.finalLinesJson ?? '[]') as Line[];
    if (lines.length !== 1) { conflict = true; continue; }
    counts.set(lines[0].valueId, (counts.get(lines[0].valueId) ?? 0) + 1);
  }
  if (counts.size > 1) conflict = true;
  const existing = db.select().from(schema.mappingProposals)
    .where(and(eq(schema.mappingProposals.sourceType, 'merchant'), eq(schema.mappingProposals.sourceId, t.merchantId), eq(schema.mappingProposals.dimension, 'account'))).get();
  if (conflict) {
    if (existing?.status === 'proposed') db.update(schema.mappingProposals).set({ status: 'dismissed' }).where(eq(schema.mappingProposals.id, existing.id)).run();
    return;
  }
  const [valueId, support] = [...counts.entries()][0] ?? [];
  if (!valueId || support < MAPPING_MIN_SUPPORT) {
    if (existing?.status === 'proposed') db.update(schema.mappingProposals).set({ supportCount: support ?? 0, status: 'dismissed' }).where(eq(schema.mappingProposals.id, existing.id)).run();
    return;
  }
  if (existing) {
    if (existing.status === 'applied' && existing.valueId === valueId) { db.update(schema.mappingProposals).set({ supportCount: support }).where(eq(schema.mappingProposals.id, existing.id)).run(); return; }
    db.update(schema.mappingProposals).set({ valueId, supportCount: support, status: existing.status === 'applied' && existing.valueId === valueId ? 'applied' : 'proposed' })
      .where(eq(schema.mappingProposals.id, existing.id)).run();
    return;
  }
  db.insert(schema.mappingProposals).values({ id: newId('mp'), sourceType: 'merchant', sourceId: t.merchantId, sourceLabel: t.merchantName ?? t.description,
    dimension: 'account', valueId, supportCount: support, status: 'proposed', createdAt: nowIso(), appliedAt: null }).run();
}

export function listMappings(status?: string): MappingProposal[] {
  const db = getDb();
  const rows = status
    ? db.select().from(schema.mappingProposals).where(eq(schema.mappingProposals.status, status as 'proposed')).orderBy(desc(schema.mappingProposals.createdAt)).all()
    : db.select().from(schema.mappingProposals).orderBy(desc(schema.mappingProposals.createdAt)).all();
  return rows.map((r) => view(r));
}

export async function applyMapping(id: string, opts: { yes?: boolean; dryRun?: boolean }): Promise<MappingProposal> {
  return withRun('FE.mapping.apply', id, async () => {
    const db = getDb();
    const p = db.select().from(schema.mappingProposals).where(eq(schema.mappingProposals.id, id)).get();
    if (!p) throw new AppError('not_found', `mapping proposal ${id} not found`, 404);
    if (p.status !== 'proposed') throw new AppError('bad_state', `Proposal is ${p.status}`, 409);
    if (opts.dryRun) return view(p, true);
    if (!isEnabled('slash.mappings')) throw new AppError('tool_off', 'Slash mappings tool (slash.mappings) is switched off in /system', 409);
    if (!opts.yes) throw new AppError('confirm_required', 'Applying a rule writes to Slash and recodes entries in review; pass --yes', 400);
    await getPorts().slash.upsertMapping({ source: { type: p.sourceType, id: p.sourceId }, dimension: p.dimension, valueId: p.valueId, applyToExistingEntries: true }, `${p.id}:apply`);
    db.update(schema.mappingProposals).set({ status: 'applied', appliedAt: nowIso() }).where(eq(schema.mappingProposals.id, id)).run();
    return view(db.select().from(schema.mappingProposals).where(eq(schema.mappingProposals.id, id)).get()!, false);
  });
}
