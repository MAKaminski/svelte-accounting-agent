// MW.mapping.propose (rule) and FE.mapping.apply (human confirm → Slash PUT /v2/accounting/mappings).
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { capabilitiesOf, getAdapter, getConnection } from '../ledgers/registry';
import { enqueue } from './queue';
import { researchAndRecommend } from './pipeline';
import { AppError, newId, nowIso } from '../util';
import type { Line, MappingProposal } from '$lib/types';
import { MAPPING_MIN_SUPPORT } from './rules';
import { accountNames } from './view';
import { withRun } from './runs';
import { isEnabled } from '../components';

async function view(p: typeof schema.mappingProposals.$inferSelect, dryRun?: boolean): Promise<MappingProposal> {
  return { ...p, accountName: (await accountNames()).get(p.valueId) ?? p.valueId, ...(dryRun !== undefined ? { dryRun } : {}) };
}

/** 3+ approvals of the same merchant to the same single account with no conflicts → proposal. */
export async function proposeMappingFor(entryId: string): Promise<void> {
  if (!await isEnabled('MW.mapping.propose')) return;
  const db = getDb();
  const t = await db.select().from(schema.ledgerTransactions).where(eq(schema.ledgerTransactions.itemId, entryId)).get();
  if (!t?.merchantId) return;
  const connectionId = t.connectionId;
  const entryIds = (await db.select({ id: schema.ledgerTransactions.itemId }).from(schema.ledgerTransactions)
    .where(and(eq(schema.ledgerTransactions.merchantId, t.merchantId), eq(schema.ledgerTransactions.connectionId, connectionId))).all()).map((r) => r.id);
  const recs = await db.select().from(schema.recommendations).where(inArray(schema.recommendations.entryId, entryIds)).all();
  const recEntry = new Map(recs.map((r) => [r.id, r.entryId]));
  const decisions = recs.length ? await db.select().from(schema.decisions).where(inArray(schema.decisions.recommendationId, recs.map((r) => r.id))).orderBy(desc(schema.decisions.decidedAt)).all() : [];
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
  const existing = await db.select().from(schema.mappingProposals)
    .where(and(eq(schema.mappingProposals.connectionId, connectionId), eq(schema.mappingProposals.sourceType, 'merchant'), eq(schema.mappingProposals.sourceId, t.merchantId), eq(schema.mappingProposals.dimension, 'account'))).get();
  if (conflict) {
    if (existing?.status === 'proposed') await db.update(schema.mappingProposals).set({ status: 'dismissed' }).where(eq(schema.mappingProposals.id, existing.id)).run();
    return;
  }
  const [valueId, support] = [...counts.entries()][0] ?? [];
  if (!valueId || support < MAPPING_MIN_SUPPORT) {
    if (existing?.status === 'proposed') await db.update(schema.mappingProposals).set({ supportCount: support ?? 0, status: 'dismissed' }).where(eq(schema.mappingProposals.id, existing.id)).run();
    return;
  }
  if (existing) {
    if (existing.status === 'applied' && existing.valueId === valueId) { await db.update(schema.mappingProposals).set({ supportCount: support }).where(eq(schema.mappingProposals.id, existing.id)).run(); return; }
    await db.update(schema.mappingProposals).set({ valueId, supportCount: support, status: existing.status === 'applied' && existing.valueId === valueId ? 'applied' : 'proposed' })
      .where(eq(schema.mappingProposals.id, existing.id)).run();
    return;
  }
  const target = capabilitiesOf(await getConnection(connectionId)).mappings === 'local' ? 'local' as const : 'ledger' as const;
  await db.insert(schema.mappingProposals).values({ id: newId('mp'), connectionId, target, sourceType: 'merchant', sourceId: t.merchantId, sourceLabel: t.merchantName ?? t.description,
    dimension: 'account', valueId, supportCount: support, status: 'proposed', createdAt: nowIso(), appliedAt: null }).run();
}

export async function listMappings(status?: string): Promise<MappingProposal[]> {
  const db = getDb();
  const rows = status
    ? await db.select().from(schema.mappingProposals).where(eq(schema.mappingProposals.status, status as 'proposed')).orderBy(desc(schema.mappingProposals.createdAt)).all()
    : await db.select().from(schema.mappingProposals).orderBy(desc(schema.mappingProposals.createdAt)).all();
  return Promise.all(rows.map((r) => view(r)));
}

export async function applyMapping(id: string, opts: { yes?: boolean; dryRun?: boolean }): Promise<MappingProposal> {
  return withRun('FE.mapping.apply', id, async () => {
    const db = getDb();
    const p = await db.select().from(schema.mappingProposals).where(eq(schema.mappingProposals.id, id)).get();
    if (!p) throw new AppError('not_found', `mapping proposal ${id} not found`, 404);
    if (p.status !== 'proposed') throw new AppError('bad_state', `Proposal is ${p.status}`, 409);
    if (opts.dryRun) return await view(p, true);
    if (!opts.yes) throw new AppError('confirm_required', p.target === 'local' ? 'Applying a rule codes this merchant automatically from now on; pass --yes' : 'Applying a rule writes to Slash and recodes entries in review; pass --yes', 400);
    if (p.target === 'local') {
      await db.insert(schema.localMappings).values({ id: newId('lm'), connectionId: p.connectionId, proposalId: p.id, sourceId: p.sourceId, valueId: p.valueId, createdBy: 'owner', createdAt: nowIso() })
        .onConflictDoUpdate({ target: [schema.localMappings.orgId, schema.localMappings.connectionId, schema.localMappings.sourceId], set: { valueId: p.valueId, proposalId: p.id, createdAt: nowIso() } }).run();
      // Re-recommend this merchant's entries still waiting for review (Tier 0 via the local rule).
      const ids = (await db.select({ id: schema.ledgerTransactions.itemId }).from(schema.ledgerTransactions)
        .where(and(eq(schema.ledgerTransactions.connectionId, p.connectionId), eq(schema.ledgerTransactions.merchantId, p.sourceId))).all()).map((r) => r.id);
      const waiting = ids.length ? await db.select({ id: schema.ledgerItems.id }).from(schema.ledgerItems)
        .where(and(inArray(schema.ledgerItems.id, ids), inArray(schema.ledgerItems.localState, ['recommended', 'invalid']))).all() : [];
      for (const w of waiting) enqueue(() => researchAndRecommend(w.id).then(() => undefined));
    } else {
      if (!await isEnabled('slash.mappings')) throw new AppError('tool_off', 'Slash mappings tool (slash.mappings) is switched off in /system', 409);
      const adapter = await getAdapter(p.connectionId);
      if (!adapter.upsertMapping) throw new AppError('no_mappings', `${adapter.kind} has no native mappings`, 409);
      await adapter.upsertMapping({ source: { type: p.sourceType, id: p.sourceId }, dimension: p.dimension, valueId: p.valueId, applyToExistingEntries: true }, `${p.id}:apply`);
    }
    await db.update(schema.mappingProposals).set({ status: 'applied', appliedAt: nowIso() }).where(eq(schema.mappingProposals.id, id)).run();
    return await view((await db.select().from(schema.mappingProposals).where(eq(schema.mappingProposals.id, id)).get())!, false);
  });
}
