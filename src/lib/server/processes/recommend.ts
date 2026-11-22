// AI.entry.recommend — rule: cache + guards → judgment: model → rule: Zod + MW.entry.validate.
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { currentOrgId, getDb, schema } from '../db';
import { getProfile } from '../profile';
import { getPorts } from '../ports';
import { config } from '../env';
import { AppError, newId, nowIso, sha256, stableJson } from '../util';
import { costUsd, type Usage } from '../ai/pricing';
import { ModelUnavailableError, type ModelResult } from '../ai/model';
import { buildRecommendSystem, PROMPT_VERSION, RECOMMEND_JSON_SCHEMA } from '../prompts/recommend.v2';
import { type TxKind } from './rules';
import { txKindOf } from './research';
import { chartSourceOf } from '../ledgers/registry';
import type { LedgerItem } from '../ledgers/types';
import { validateRecommendation, type RecOutput } from './validate';
import { enabledAccounts } from './coa';
import { withRun } from './runs';
import { recView, accountNames } from "./view";
import { isEnabled } from '../components';

const OutputSchema = z.object({
  action: z.enum(['code', 'ask']),
  lines: z.array(z.object({ valueId: z.string().min(1), amountCents: z.number().int(), description: z.string().max(200).nullable().optional() })),
  memo: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
  question: z.string().nullable()
});

export interface RecInput {
  transaction: { description: string; amountCents: number; date?: string; mcc?: string | null; merchantName?: string | null; kind: TxKind };
  evidence: { id: string; kind: string; summary: string }[];
  ownerAnswers: string[];
}
export interface RecContext {
  accounts: { id: string; name: string }[];
  payoutMatched: boolean;
  /** Account Slash already applied through a learned mapping, if any. */
  precodedValueId?: string | null;
}
export interface RecResult {
  output: RecOutput;
  model: string;
  usage: Usage;
  costUsd: number;
  ttftMs: number | null;
  e2eMs: number;
  inputHash: string;
  errors: string[];
}

const ZERO: Usage = { fresh: 0, cacheWrite: 0, cacheRead: 0, out: 0 };

/** Level A cache key: hash(inputs + prompt version + model route + account set + company profile). */
export async function inputHashFor(input: RecInput, ctx: RecContext): Promise<string> {
  const route = ctx.payoutMatched ? config.modelIntegrator : config.modelWorker;
  const mode = await isEnabled('AI.entry.recommend') ? 'on' : 'off';
  const p = await getProfile(currentOrgId());
  return sha256(stableJson(input) + PROMPT_VERSION + route + stableJson(ctx.accounts.map((a) => a.id).sort()) + (ctx.precodedValueId ?? '') + mode + sha256(p.business + '\n' + p.codingRules));
}

function validationContext(input: RecInput, ctx: RecContext) {
  return { amountCents: input.transaction.amountCents, enabledValueIds: new Set(ctx.accounts.map((a) => a.id)), kind: input.transaction.kind, hasOwnerAnswer: input.ownerAnswers.length > 0 };
}

/** Core used by both the pipeline and the eval harness. Never touches entry state. */
export async function recommendForInput(input: RecInput, ctx: RecContext): Promise<RecResult> {
  const vctx = validationContext(input, ctx);
  const enabled = vctx.enabledValueIds;
  const hasOwnerAnswer = vctx.hasOwnerAnswer;
  const route = ctx.payoutMatched ? config.modelIntegrator : config.modelWorker;
  const inputHash = await inputHashFor(input, ctx);
  const ruleResult = (output: RecOutput, model = 'rules'): RecResult =>
    ({ output, model, usage: ZERO, costUsd: 0, ttftMs: 0, e2eMs: 0, inputHash, errors: validateRecommendation(output, vctx) });

  // rule: a Slash mapping already coded it (Tier 0).
  if (ctx.precodedValueId && enabled.has(ctx.precodedValueId)) {
    const name = ctx.accounts.find((a) => a.id === ctx.precodedValueId)!.name;
    return ruleResult({ action: 'code', lines: [{ valueId: ctx.precodedValueId, amountCents: input.transaction.amountCents }], memo: `${input.transaction.merchantName ?? input.transaction.description}`.slice(0, 200),
      confidence: 0.99, reasoning: `This merchant is coded to ${name} by a learned mapping rule.`, question: null }, 'rules:mapping');
  }
  // rule: never code own transfers / person payments without an owner answer (Tier 0, defense in depth).
  if (!hasOwnerAnswer && (input.transaction.kind === 'own_transfer' || input.transaction.kind === 'p2p')) {
    const transfer = input.transaction.kind === 'own_transfer';
    return ruleResult({ action: 'ask', lines: [], memo: transfer ? 'Transfer between own accounts' : 'Payment to a person', confidence: 0,
      reasoning: transfer ? 'Transfers between own accounts are never coded.' : 'Payments to people need the owner to say what they were for.',
      question: transfer ? 'Is this a transfer between your own accounts? Best guess: yes, so it should not be coded.'
        : `Who was this payment to and what was it for? Best guess: a personal payment (Owner's Draw).` }, 'rules:guard');
  }

  // Control plane: recommend agent switched off → manual mode, no model call.
  if (!await isEnabled('AI.entry.recommend')) {
    return ruleResult({ action: 'ask', lines: [], memo: (input.transaction.merchantName ?? input.transaction.description).slice(0, 200), confidence: 0,
      reasoning: 'The recommendation agent (AI.entry.recommend) is switched off in /system; code this entry by hand.',
      question: 'Recommendation agent is off. Choose the account by hand.' }, 'off:AI.entry.recommend');
  }

  // judgment: model call with one retry, then one fallback to the integrator tier.
  const { model } = getPorts();
  const profile = await getProfile(currentOrgId());
  const system = buildRecommendSystem(ctx.accounts, profile);
  const user = JSON.stringify(input);
  const attempt = (m: string) => model.complete({ step: 'recommend', model: m, system, user, maxTokens: 1500, jsonSchema: RECOMMEND_JSON_SCHEMA as unknown as Record<string, unknown> });
  const plan = [route, route, ...(route === config.modelIntegrator ? [] : [config.modelIntegrator])];
  let total: Usage = { ...ZERO };
  let cost = 0;
  let last: ModelResult | null = null;
  let lastErr: Error | null = null;
  for (const m of plan) {
    try {
      const res = await attempt(m);
      total = { fresh: total.fresh + res.usage.fresh, cacheWrite: total.cacheWrite + res.usage.cacheWrite, cacheRead: total.cacheRead + res.usage.cacheRead, out: total.out + res.usage.out };
      cost += costUsd(res.model, res.usage);
      last = res;
      const parsed = OutputSchema.safeParse(safeJson(res.text));
      if (!parsed.success) { lastErr = new AppError('model_schema', 'Model output failed the schema check', 502, 'model'); continue; }
      const output: RecOutput = { ...parsed.data, lines: parsed.data.lines.map((l) => ({ valueId: l.valueId, amountCents: l.amountCents, ...(l.description ? { description: l.description } : {}) })) };
      return { output, model: res.model, usage: total, costUsd: cost, ttftMs: res.ttftMs, e2eMs: res.e2eMs, inputHash, errors: validateRecommendation(output, vctx) };
    } catch (e) {
      if (!(e instanceof ModelUnavailableError)) throw e;
      lastErr = e;
    }
  }
  if (lastErr instanceof ModelUnavailableError) throw lastErr;
  throw new AppError('model_schema', `Model output failed the schema check after retry (${last?.model ?? 'n/a'})`, 502, 'model');
}

function safeJson(t: string): unknown {
  try { return JSON.parse(t); } catch { return null; }
}

/** Builds the volatile input for an entry from DB state. */
export async function buildInputForEntry(entryId: string): Promise<{ input: RecInput; ctx: RecContext }> {
  const db = getDb();
  const e = await db.select().from(schema.ledgerItems).where(eq(schema.ledgerItems.id, entryId)).get();
  const t = await db.select().from(schema.ledgerTransactions).where(eq(schema.ledgerTransactions.itemId, entryId)).get();
  if (!e || !t) throw new AppError('not_found', `entry ${entryId} not found`, 404);
  const ev = await db.select().from(schema.evidence).where(eq(schema.evidence.entryId, entryId)).orderBy(schema.evidence.createdAt).all();
  const item = JSON.parse(e.rawJson) as LedgerItem;
  const source = await chartSourceOf(e.connectionId);
  // Precoded = the ledger applied a native mapping (Slash), or one of our local rules matches (Mercury).
  const ledgerMapped = item.codedBy === 'mapping' ? item.coding?.[0]?.valueId ?? null : null;
  const local = t.merchantId ? await db.select().from(schema.localMappings)
    .where(and(eq(schema.localMappings.connectionId, e.connectionId), eq(schema.localMappings.sourceId, t.merchantId))).get() : undefined;
  return {
    input: {
      transaction: { description: t.description, amountCents: e.amountCents, date: t.date, mcc: t.mcc, merchantName: t.merchantName, kind: txKindOf(t) },
      evidence: ev.filter((x) => x.kind !== 'owner_answer').map((x) => ({ id: x.id, kind: x.kind, summary: x.summary })),
      ownerAnswers: ev.filter((x) => x.kind === 'owner_answer').map((x) => x.summary)
    },
    ctx: {
      accounts: (await enabledAccounts(source)).map((a) => ({ id: a.id, name: a.name })),
      payoutMatched: ev.some((x) => x.kind === 'payout_row'),
      precodedValueId: ledgerMapped ?? local?.valueId ?? null
    }
  };
}

export async function recommendEntry(entryId: string, opts: { force?: boolean } = {}) {
  return withRun('AI.entry.recommend', entryId, async (runId) => {
    const db = getDb();
    const { input, ctx } = await buildInputForEntry(entryId);
    // Exact-input cache (Level A): unchanged hash for this entry → reuse the stored output, no model call.
    const prev = await db.select().from(schema.recommendations).where(eq(schema.recommendations.entryId, entryId)).orderBy(desc(schema.recommendations.createdAt)).limit(1).get();
    if (!opts.force && prev && prev.inputHash === await inputHashFor(input, ctx)) {
      const stored: RecOutput = { action: prev.action, lines: JSON.parse(prev.linesJson), memo: prev.memo, confidence: prev.confidence, reasoning: prev.reasoning, question: prev.question };
      await setStateFromRec(entryId, validateRecommendation(stored, validationContext(input, ctx)));
      return recView(prev, await accountNames());
    }
    let result: RecResult;
    try {
      result = await recommendForInput(input, ctx);
    } catch (e) {
      const err = e as AppError;
      await db.update(schema.ledgerItems).set({ localState: 'invalid', stateReason: `${(err.source ?? 'app').toUpperCase()}: ${err.code === 'model_unavailable' ? 'Model unavailable, retry' : err.message}`, updatedAt: nowIso() })
        .where(eq(schema.ledgerItems.id, entryId)).run();
      throw e;
    }
    const rec = {
      id: newId('rec'), entryId, runId, primaryValueId: result.output.lines[0]?.valueId ?? null, action: result.output.action,
      linesJson: JSON.stringify(result.output.lines), memo: result.output.memo.slice(0, 200), confidence: result.output.confidence,
      reasoning: result.output.reasoning, question: result.output.question, promptVersion: PROMPT_VERSION, model: result.model,
      inputHash: result.inputHash, tokensFresh: result.usage.fresh, tokensCacheWrite: result.usage.cacheWrite, tokensCacheRead: result.usage.cacheRead,
      tokensOut: result.usage.out, costUsd: result.costUsd, ttftMs: result.ttftMs, e2eMs: result.e2eMs,
      shadowAutoApprove: result.output.action === 'code' && !result.errors.length && result.output.confidence >= config.shadowThreshold,
      createdAt: nowIso()
    };
    await db.insert(schema.recommendations).values(rec).run();
    await setStateFromRec(entryId, result.errors);
    return recView((await db.select().from(schema.recommendations).where(eq(schema.recommendations.id, rec.id)).get())!, await accountNames());
  });
}

async function setStateFromRec(entryId: string, errors: string[]) {
  // On success keep research's partial-source notes (e.g. "QuickBooks unavailable") as the reason.
  await getDb().update(schema.ledgerItems).set(errors.length
    ? { localState: 'invalid', stateReason: `Invalid: ${errors.join('; ')}`, updatedAt: nowIso() }
    : { localState: 'recommended', updatedAt: nowIso() }
  ).where(and(eq(schema.ledgerItems.id, entryId))).run();
}
