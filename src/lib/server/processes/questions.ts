// FE.question.answer — the answer becomes permanent evidence, then the entry is re-researched and re-recommended.
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { AppError, newId, nowIso } from '../util';
import type { Question } from '$lib/types';
import { withRun } from './runs';
import { enqueue } from './queue';
import { researchAndRecommend } from './pipeline';

export function questionView(id: string): Question {
  const db = getDb();
  const q = db.select().from(schema.questions).where(eq(schema.questions.id, id)).get();
  if (!q) throw new AppError('not_found', `question ${id} not found`, 404);
  const t = db.select().from(schema.slashTransactions).where(eq(schema.slashTransactions.accountingEntryId, q.entryId)).get();
  return { ...q, merchant: t?.merchantName ?? t?.description ?? null, amountCents: t?.amountCents ?? null };
}

export function listQuestions(status?: string): Question[] {
  const db = getDb();
  const rows = status
    ? db.select().from(schema.questions).where(eq(schema.questions.status, status as 'open' | 'answered')).orderBy(desc(schema.questions.createdAt)).all()
    : db.select().from(schema.questions).orderBy(desc(schema.questions.createdAt)).all();
  return rows.map((q) => questionView(q.id));
}

export async function answerQuestion(id: string, text: string, opts: { wait?: boolean } = {}): Promise<Question> {
  return withRun('FE.question.answer', id, async () => {
    if (!text?.trim()) throw new AppError('empty_answer', 'Answer text is required', 400);
    const db = getDb();
    const q = db.select().from(schema.questions).where(eq(schema.questions.id, id)).get();
    if (!q) throw new AppError('not_found', `question ${id} not found`, 404);
    if (q.status === 'answered') throw new AppError('already_answered', 'Question is already answered', 409);
    db.transaction(() => {
      db.update(schema.questions).set({ status: 'answered', answer: text.trim(), answeredAt: nowIso() }).where(eq(schema.questions.id, id)).run();
      db.insert(schema.evidence).values({ id: newId('ev'), entryId: q.entryId, kind: 'owner_answer', reference: id, summary: `Owner: "${text.trim()}" (asked: ${q.text})`, createdAt: nowIso() }).run();
      db.update(schema.accountingEntries).set({ localState: 'researched', updatedAt: nowIso() }).where(eq(schema.accountingEntries.id, q.entryId)).run();
    });
    if (opts.wait) await researchAndRecommend(q.entryId);
    else enqueue(() => researchAndRecommend(q.entryId).then(() => undefined));
    return questionView(id);
  });
}
