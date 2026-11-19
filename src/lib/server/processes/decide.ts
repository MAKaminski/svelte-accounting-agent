// Human decisions and the Slash write path.
// FE.entry.approve → (undo window) → MW.entry.code → MW.entry.ready. FE.entry.undo / ask / reject.
import { and, desc, eq, lte, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { getPorts } from '../ports';
import { config } from '../env';
import { AppError, newId, nowIso } from '../util';
import { SlashHttpError } from '../slash';
import type { Decision, Line, Question } from '$lib/types';
import { LineSchema } from '$lib/types';
import { classifyTxKind } from './rules';
import { validateLines } from './validate';
import { enabledAccounts } from './coa';
import { accountNames, latestRec } from './view';
import { withRun } from './runs';
import { proposeMappingFor } from './mappings';
import { questionView } from './questions';

function loadEntry(id: string) {
  const e = getDb().select().from(schema.accountingEntries).where(eq(schema.accountingEntries.id, id)).get();
  if (!e) throw new AppError('not_found', `entry ${id} not found`, 404);
  return e;
}

function openQuestion(entryId: string) {
  return getDb().select().from(schema.questions).where(and(eq(schema.questions.entryId, entryId), eq(schema.questions.status, 'open'))).get();
}

function latestDecision(entryId: string) {
  const recs = getDb().select({ id: schema.recommendations.id }).from(schema.recommendations).where(eq(schema.recommendations.entryId, entryId)).all().map((r) => r.id);
  if (!recs.length) return null;
  return getDb().select().from(schema.decisions).where(inArray(schema.decisions.recommendationId, recs)).orderBy(desc(schema.decisions.decidedAt)).limit(1).get() ?? null;
}

function decisionView(d: typeof schema.decisions.$inferSelect, entryId: string, dryRun = false): Decision {
  const e = loadEntry(entryId);
  const names = accountNames();
  const lines = d.finalLinesJson ? (JSON.parse(d.finalLinesJson) as Line[]).map((l) => ({ ...l, accountName: names.get(l.valueId) ?? l.valueId })) : null;
  return { id: d.id, entryId, action: d.action, lines, decidedBy: d.decidedBy, decidedAt: d.decidedAt, state: e.localState, pendingUntil: e.pendingUntil, dryRun };
}

export interface ApproveInput { lines?: Line[] | string; memo?: string; override?: boolean; by?: string; later?: boolean; dryRun?: boolean; yes?: boolean }

export async function approve(entryId: string, inp: ApproveInput): Promise<Decision> {
  return withRun('FE.entry.approve', entryId, async () => {
    const db = getDb();
    const e = loadEntry(entryId);
    const rec = latestRec(entryId);
    if (!rec) throw new AppError('no_recommendation', 'Entry has no recommendation yet; run `books entry recommend` first', 409);
    if (openQuestion(entryId) && !inp.override) throw new AppError('open_question', 'entry has an open question; answer it or pass --override', 409);
    const allowed = ['recommended', 'invalid', ...(inp.override ? ['asked'] : [])];
    if (!allowed.includes(e.localState)) throw new AppError('bad_state', `Entry is ${e.localState}; only recommended entries can be approved`, 409);

    let lines: Line[];
    let edited = false;
    if (inp.lines !== undefined) {
      const raw = typeof inp.lines === 'string' ? JSON.parse(inp.lines) : inp.lines;
      const parsed = LineSchema.array().safeParse(raw);
      if (!parsed.success) throw new AppError('bad_lines', `lines must be [{valueId, amountCents, description?}]: ${parsed.error.issues[0]?.message}`, 400);
      lines = parsed.data;
      edited = JSON.stringify(lines.map((l) => [l.valueId, l.amountCents])) !== JSON.stringify((JSON.parse(rec.linesJson) as Line[]).map((l) => [l.valueId, l.amountCents]));
    } else {
      lines = JSON.parse(rec.linesJson) as Line[];
      if (rec.action === 'ask' || !lines.length) throw new AppError('no_lines', 'The recommendation is a question, not a coding; answer it or pass --lines', 409);
      if (e.localState === 'invalid') throw new AppError('invalid_recommendation', `Recommendation is invalid (${e.stateReason}); pass corrected --lines`, 409);
    }
    const memo = (inp.memo ?? rec.memo).slice(0, 200);
    const t = db.select().from(schema.slashTransactions).where(eq(schema.slashTransactions.accountingEntryId, entryId)).get();
    const hasOwnerAnswer = !!db.select().from(schema.evidence).where(and(eq(schema.evidence.entryId, entryId), eq(schema.evidence.kind, 'owner_answer'))).get();
    const errs = validateLines(lines, { amountCents: e.amountCents, enabledValueIds: new Set(enabledAccounts().map((a) => a.id)),
      kind: classifyTxKind(t?.description ?? '', !!t?.merchantId), hasOwnerAnswer: hasOwnerAnswer || !!inp.override });
    if (errs.length) throw new AppError('invalid_lines', errs.join('; '), 422);

    const now = new Date();
    const d = { id: newId('dec'), recommendationId: rec.id, action: (edited ? 'edited' : 'approved') as 'edited' | 'approved',
      finalLinesJson: JSON.stringify(lines), finalMemo: memo, decidedBy: inp.by ?? config.reviewer, decidedAt: nowIso(now) };
    if (inp.dryRun) {
      const names = accountNames();
      return { id: d.id, entryId, action: d.action, lines: lines.map((l) => ({ ...l, accountName: names.get(l.valueId) ?? l.valueId })),
        decidedBy: d.decidedBy, decidedAt: d.decidedAt, state: e.localState, pendingUntil: null, dryRun: true };
    }
    const pendingUntil = inp.later ? nowIso(new Date(now.getTime() + config.undoWindowMs)) : nowIso(now);
    db.transaction(() => {
      db.insert(schema.decisions).values(d).run();
      db.update(schema.accountingEntries).set({ localState: 'approved', pendingUntil, stateReason: null, updatedAt: nowIso() }).where(eq(schema.accountingEntries.id, entryId)).run();
    });
    proposeMappingFor(entryId);
    if (!inp.later) await commit(entryId);
    return decisionView(db.select().from(schema.decisions).where(eq(schema.decisions.id, d.id)).get()!, entryId);
  });
}

export async function undo(entryId: string): Promise<Decision> {
  return withRun('FE.entry.undo', entryId, async () => {
    const db = getDb();
    const e = loadEntry(entryId);
    if (e.localState !== 'approved' || !e.pendingUntil || Date.parse(e.pendingUntil) <= Date.now()) {
      throw new AppError('undo_window_closed', `Nothing to undo: entry is ${e.localState}${e.localState === 'approved' ? ' and already sending to Slash' : ''}`, 409);
    }
    const prev = latestDecision(entryId)!;
    const d = { id: newId('dec'), recommendationId: prev.recommendationId, action: 'undone' as const, finalLinesJson: null, finalMemo: null, decidedBy: config.reviewer, decidedAt: nowIso() };
    db.transaction(() => {
      db.insert(schema.decisions).values(d).run();
      db.update(schema.accountingEntries).set({ localState: 'recommended', pendingUntil: null, updatedAt: nowIso() }).where(eq(schema.accountingEntries.id, entryId)).run();
    });
    proposeMappingFor(entryId);
    return decisionView(db.select().from(schema.decisions).where(eq(schema.decisions.id, d.id)).get()!, entryId);
  });
}

/** MW.entry.code then MW.entry.ready for one approved entry whose undo window has passed. */
export async function commit(entryId: string): Promise<void> {
  const db = getDb();
  const e = loadEntry(entryId);
  if (e.localState === 'approved') {
    if (e.pendingUntil && Date.parse(e.pendingUntil) > Date.now()) return;
    const d = latestDecision(entryId);
    if (!d?.finalLinesJson) return;
    const lines = JSON.parse(d.finalLinesJson) as Line[];
    const body = lines.length === 1
      ? { memo: d.finalMemo ?? undefined, dimensions: { account: lines[0].valueId } }
      : { memo: d.finalMemo ?? undefined, lineItems: lines.map((l) => ({ amountCents: l.amountCents, description: l.description, dimensions: { account: l.valueId } })) };
    try {
      await withRun('MW.entry.code', entryId, () => getPorts().slash.updateEntry(entryId, body, `${d.id}:code`));
      db.update(schema.accountingEntries).set({ localState: 'coded', pendingUntil: null, updatedAt: nowIso() }).where(eq(schema.accountingEntries.id, entryId)).run();
    } catch (err) {
      if (err instanceof SlashHttpError && err.httpStatus === 409) {
        db.update(schema.accountingEntries).set({ pendingUntil: nowIso(new Date(Date.now() + 60_000)), stateReason: 'SLASH: entry is syncing; retrying in 60 s', updatedAt: nowIso() })
          .where(eq(schema.accountingEntries.id, entryId)).run();
        return;
      }
      const msg = (err as Error).message;
      db.update(schema.accountingEntries).set({ localState: 'recommended', pendingUntil: null, stateReason: `SLASH: coding rejected — ${msg}`, updatedAt: nowIso() })
        .where(eq(schema.accountingEntries.id, entryId)).run();
      return;
    }
  }
  const cur = loadEntry(entryId);
  if (cur.localState !== 'coded') return;
  const d = latestDecision(entryId)!;
  try {
    const res = await withRun('MW.entry.ready', entryId, () => getPorts().slash.markReady(entryId, `${d.id}:ready`));
    db.update(schema.accountingEntries).set({ localState: 'ready', slashStatus: res.status, stateReason: null, updatedAt: nowIso() }).where(eq(schema.accountingEntries.id, entryId)).run();
  } catch (err) {
    db.update(schema.accountingEntries).set({ stateReason: `SLASH: mark ready failed — ${(err as Error).message}`, updatedAt: nowIso() }).where(eq(schema.accountingEntries.id, entryId)).run();
  }
}

/** Scheduler tick: commit every approved entry whose undo window has expired (and retry coded ones). */
export async function commitDue(): Promise<number> {
  const db = getDb();
  const due = db.select({ id: schema.accountingEntries.id }).from(schema.accountingEntries)
    .where(and(eq(schema.accountingEntries.localState, 'approved'), lte(schema.accountingEntries.pendingUntil, nowIso()))).all();
  for (const { id } of due) await commit(id);
  return due.length;
}

export async function ask(entryId: string, inp: { text?: string; by?: string }): Promise<Question> {
  return withRun('FE.entry.ask', entryId, async () => {
    const db = getDb();
    const e = loadEntry(entryId);
    if (!['recommended', 'invalid', 'researched'].includes(e.localState)) throw new AppError('bad_state', `Entry is ${e.localState}; cannot ask now`, 409);
    if (openQuestion(entryId)) throw new AppError('already_asked', 'Entry already has an open question', 409);
    const rec = latestRec(entryId);
    const text = inp.text?.trim() || rec?.question;
    if (!text) throw new AppError('no_question', 'No question text: pass --text', 400);
    const bestGuess = text.match(/Best guess:\s*(.+?)\.?$/i)?.[1] ?? null;
    const q = { id: newId('q'), entryId, text, bestGuess, answer: null, status: 'open' as const, createdAt: nowIso(), answeredAt: null };
    db.transaction(() => {
      db.insert(schema.questions).values(q).run();
      if (rec) db.insert(schema.decisions).values({ id: newId('dec'), recommendationId: rec.id, action: 'asked', finalLinesJson: null, finalMemo: null, decidedBy: inp.by ?? config.reviewer, decidedAt: nowIso() }).run();
      db.update(schema.accountingEntries).set({ localState: 'asked', updatedAt: nowIso() }).where(eq(schema.accountingEntries.id, entryId)).run();
    });
    return questionView(q.id);
  });
}

export async function reject(entryId: string, inp: { reason?: string; yes?: boolean; by?: string }): Promise<Decision> {
  return withRun('FE.entry.reject', entryId, async () => {
    if (!inp.yes) throw new AppError('confirm_required', 'Rejecting needs --yes', 400);
    const db = getDb();
    const e = loadEntry(entryId);
    if (!['recommended', 'invalid', 'asked'].includes(e.localState)) throw new AppError('bad_state', `Entry is ${e.localState}; cannot reject`, 409);
    const rec = latestRec(entryId);
    if (!rec) throw new AppError('no_recommendation', 'Nothing to reject', 409);
    const d = { id: newId('dec'), recommendationId: rec.id, action: 'rejected' as const, finalLinesJson: null, finalMemo: inp.reason ?? null, decidedBy: inp.by ?? config.reviewer, decidedAt: nowIso() };
    db.transaction(() => {
      db.insert(schema.decisions).values(d).run();
      db.update(schema.accountingEntries).set({ localState: 'rejected', stateReason: inp.reason ? `Rejected: ${inp.reason}` : 'Rejected; code by hand in Slash', updatedAt: nowIso() }).where(eq(schema.accountingEntries.id, entryId)).run();
    });
    return decisionView(db.select().from(schema.decisions).where(eq(schema.decisions.id, d.id)).get()!, entryId);
  });
}
