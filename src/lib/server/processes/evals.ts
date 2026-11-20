// IN.evals.run — replay the AI steps on eval_cases and score them. Also shadow precision + cost by week.
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDb, schema } from '../db';
import { getPorts } from '../ports';
import { AppError, newId } from '../util';
import type { EvalRun, Line } from '$lib/types';
import { classifyTxKind, type TxKind } from './rules';
import { recommendForInput, buildInputForEntry, type RecInput } from './recommend';
import { identifyMerchant } from './identify';
import { enabledAccounts, pullCoa } from './coa';
import { withRun } from './runs';

interface CaseInput { chart?: 'slash' | 'qbo'; transaction: { description: string; amountCents: number; mcc?: string; merchantName?: string; kind?: TxKind }; evidence: { id: string; kind: string; summary: string }[]; payoutMatched?: boolean; ownerAnswers?: string[] }
interface Expected { action: 'code' | 'ask'; valueIds?: string[]; minConfidence?: number; noQuestion?: boolean; questionMentions?: string[]; questionHasBestGuess?: boolean; lineCount?: number; sumCents?: number; noLines?: boolean; forbidValueIds?: string[] }

export async function seedEvalCases(path = resolve(process.cwd(), 'fixtures/evals/seed.json')) {
  const db = getDb();
  const cases = JSON.parse(readFileSync(path, 'utf8')) as { id: string; kind: 'golden' | 'edge' | 'refuse'; name: string; input: unknown; expected: unknown }[];
  for (const c of cases) {
    const v = { id: c.id, kind: c.kind, name: c.name, inputJson: JSON.stringify(c.input), expectedJson: JSON.stringify(c.expected) };
    await db.insert(schema.evalCases).values(v).onConflictDoUpdate({ target: [schema.evalCases.orgId, schema.evalCases.id], set: v }).run();
  }
  return cases.length;
}

export function score(out: { action: string; lines: { valueId: string; amountCents: number }[]; confidence: number; question: string | null }, exp: Expected, names: Map<string, string>, errors: string[]): string[] {
  const f: string[] = [];
  if (errors.length) f.push(`validator: ${errors.join('; ')}`);
  if (out.action !== exp.action) f.push(`action ${out.action} ≠ ${exp.action}`);
  if (exp.valueIds && JSON.stringify(out.lines.map((l) => l.valueId)) !== JSON.stringify(exp.valueIds)) f.push(`accounts ${out.lines.map((l) => l.valueId).join(',') || '∅'} ≠ ${exp.valueIds.join(',')}`);
  if (exp.minConfidence !== undefined && out.confidence < exp.minConfidence) f.push(`confidence ${out.confidence} < ${exp.minConfidence}`);
  if (exp.noQuestion && out.question) f.push('unexpected question');
  if (exp.questionMentions) for (const m of exp.questionMentions) if (!out.question?.includes(m)) f.push(`question does not name ${m}`);
  if (exp.questionHasBestGuess && !/best guess/i.test(out.question ?? '')) f.push('question has no best guess');
  if (exp.lineCount !== undefined && out.lines.length !== exp.lineCount) f.push(`${out.lines.length} lines ≠ ${exp.lineCount}`);
  if (exp.sumCents !== undefined && out.lines.reduce((s, l) => s + l.amountCents, 0) !== exp.sumCents) f.push(`lines do not sum to ${exp.sumCents}`);
  if (exp.noLines && out.lines.length) f.push('expected no lines');
  if (exp.forbidValueIds) for (const v of exp.forbidValueIds) if (out.lines.some((l) => l.valueId === v)) f.push(`must never use ${names.get(v) ?? v}`);
  return f;
}

export async function runEvals(): Promise<EvalRun> {
  return withRun('IN.evals.run', null, async (runId) => {
    const db = getDb();
    if (!(await enabledAccounts('slash')).length) await pullCoa();
    if (!(await enabledAccounts('qbo')).length) await pullCoa({ includeQbo: true });
    if (!await db.select().from(schema.evalCases).limit(1).get()) await seedEvalCases();
    const charts = { slash: (await enabledAccounts('slash')).map((a) => ({ id: a.id, name: a.name })), qbo: (await enabledAccounts('qbo')).map((a) => ({ id: a.id, name: a.name })) };
    const names = new Map([...charts.slash, ...charts.qbo].map((a) => [a.id, a.name]));
    const cases = await db.select().from(schema.evalCases).orderBy(schema.evalCases.id).all();
    const results: EvalRun['cases'] = [];
    for (const c of cases) {
      const ci = JSON.parse(c.inputJson) as CaseInput;
      const exp = JSON.parse(c.expectedJson) as Expected;
      const t0 = Date.now();
      let failures: string[] = [];
      let cost = 0;
      await withRun('AI.entry.recommend', c.id, async () => {
        const kind = ci.transaction.kind ?? classifyTxKind(ci.transaction.description, !!ci.transaction.merchantName);
        const evidence = [...ci.evidence];
        // Same pipeline rule as research: no history → identify the merchant first.
        if (kind === 'card' && ci.transaction.merchantName && !evidence.some((e) => e.kind === 'slash_history' || e.kind === 'qbo_history')) {
          const p = await identifyMerchant({ merchantName: ci.transaction.merchantName, mcc: ci.transaction.mcc ?? null, description: ci.transaction.description }, c.id, c.id);
          cost += p.costUsd;
          evidence.push({ id: 'ev_profile', kind: 'merchant_profile', summary: `${p.kind} (${p.confidence.toFixed(2)}): ${p.summary}` });
        }
        const input: RecInput = { transaction: { ...ci.transaction, kind }, evidence, ownerAnswers: ci.ownerAnswers ?? [] };
        try {
          const r = await recommendForInput(input, { accounts: charts[ci.chart ?? 'slash'], payoutMatched: !!ci.payoutMatched });
          cost += r.costUsd;
          failures = score(r.output, exp, names, r.errors);
        } catch (e) {
          failures = [`error: ${(e as Error).message}`];
        }
      }, c.id).catch(() => undefined);
      results.push({ caseId: c.id, name: c.name, kind: c.kind, pass: failures.length === 0, failures, costUsd: cost, e2eMs: Date.now() - t0 });
    }
    const run: EvalRun = { runId, mode: getPorts().model.mode, passed: results.filter((r) => r.pass).length, total: results.length, costUsd: results.reduce((s, r) => s + r.costUsd, 0), cases: results };
    await db.update(schema.runs).set({ detailJson: JSON.stringify({ evalRun: run }) }).where(eq(schema.runs.id, runId)).run();
    return run;
  });
}

export async function evalSummary() {
  const db = getDb();
  const lastRunRow = (await db.select().from(schema.runs).where(eq(schema.runs.processId, 'IN.evals.run')).orderBy(desc(schema.runs.startedAt)).all())
    .find((r) => r.detailJson?.includes('evalRun'));
  const lastRun = lastRunRow ? (JSON.parse(lastRunRow.detailJson!).evalRun as EvalRun) : null;

  // Shadow precision: of recommendations a human decided on, how many were approved unchanged?
  const decisions = await db.select().from(schema.decisions).orderBy(desc(schema.decisions.decidedAt)).all();
  const latestByRec = new Map<string, typeof decisions[number]>();
  for (const d of decisions) if (!latestByRec.has(d.recommendationId) && d.action !== 'undone') latestByRec.set(d.recommendationId, d);
  const recs = latestByRec.size ? await db.select().from(schema.recommendations).where(inArray(schema.recommendations.id, [...latestByRec.keys()])).all() : [];
  const scored = recs.filter((r) => r.action === 'code');
  const agreed = scored.filter((r) => latestByRec.get(r.id)!.action === 'approved').length;
  const auto = scored.filter((r) => r.shadowAutoApprove);
  const autoAgreed = auto.filter((r) => latestByRec.get(r.id)!.action === 'approved').length;

  // RLS scopes this to the current org.
  const weekly = (await db.execute(sql`select to_char(created_at::timestamptz, 'IYYY-"W"IW') as week, count(*)::int as calls,
            sum(cost_usd)::float8 as cost, sum(tokens_cache_read)::float8 as read,
            sum(tokens_fresh + tokens_cache_write + tokens_cache_read)::float8 as total
     from recommendations group by week order by week desc limit 12`)) as unknown as { rows?: unknown[] } | unknown[];
  const weeklyRows = (Array.isArray(weekly) ? weekly : weekly.rows ?? []) as { week: string; calls: number; cost: number | null; read: number | null; total: number | null }[];
  return {
    lastRun,
    shadow: {
      decisions: scored.length, agreed, precision: scored.length ? agreed / scored.length : null,
      autoApproveWouldHave: auto.length, autoApprovePrecision: auto.length ? autoAgreed / auto.length : null
    },
    costByWeek: weeklyRows.map((w) => ({ week: w.week, calls: Number(w.calls), costUsd: Number(w.cost ?? 0), cacheReadShare: w.total ? Number(w.read ?? 0) / Number(w.total) : null })),
    cases: await db.select({ id: schema.evalCases.id, kind: schema.evalCases.kind, name: schema.evalCases.name }).from(schema.evalCases).all()
  };
}

/** FE.eval.add — a decided entry becomes a golden case (input frozen from current evidence, expected = human's lines). */
export async function addEvalFromEntry(entryId: string) {
  const db = getDb();
  const recIds = (await db.select({ id: schema.recommendations.id }).from(schema.recommendations).where(eq(schema.recommendations.entryId, entryId)).all()).map((r) => r.id);
  const d = recIds.length ? (await db.select().from(schema.decisions).where(inArray(schema.decisions.recommendationId, recIds)).orderBy(desc(schema.decisions.decidedAt)).all())
    .find((x) => (x.action === 'approved' || x.action === 'edited') && x.finalLinesJson) : undefined;
  if (!d) throw new AppError('no_decision', 'Entry has no approved decision to learn from', 409);
  const { input, ctx } = await buildInputForEntry(entryId);
  const lines = JSON.parse(d.finalLinesJson!) as Line[];
  const c = { id: newId('ec'), kind: 'golden' as const, name: `${input.transaction.merchantName ?? input.transaction.description} (from ${entryId})`,
    inputJson: JSON.stringify({ transaction: input.transaction, evidence: input.evidence, ownerAnswers: input.ownerAnswers, payoutMatched: ctx.payoutMatched }),
    expectedJson: JSON.stringify({ action: 'code', valueIds: lines.map((l) => l.valueId), sumCents: input.transaction.amountCents }) };
  await db.insert(schema.evalCases).values(c).run();
  return { id: c.id, kind: c.kind, name: c.name };
}

