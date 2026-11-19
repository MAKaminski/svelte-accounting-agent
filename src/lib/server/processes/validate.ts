// MW.entry.validate — deterministic checks around the judgment step. Pure function; unit-tested.
import type { TxKind } from './rules';

export interface RecOutput {
  action: 'code' | 'ask';
  lines: { valueId: string; amountCents: number; description?: string | null }[];
  memo: string;
  confidence: number;
  reasoning: string;
  question: string | null;
}

export function validateRecommendation(
  rec: RecOutput,
  ctx: { amountCents: number; enabledValueIds: Set<string>; kind: TxKind; hasOwnerAnswer: boolean }
): string[] {
  const errs: string[] = [];
  if (!(rec.confidence >= 0 && rec.confidence <= 1)) errs.push('confidence must be between 0 and 1');
  if (rec.memo.length > 200) errs.push('memo longer than 200 characters');
  if (rec.action === 'ask') {
    if (!rec.question?.trim()) errs.push('ask without a question');
    if (rec.lines.length) errs.push('ask must not carry lines');
    return errs;
  }
  errs.push(...validateLines(rec.lines, ctx));
  return errs;
}

export function validateLines(
  lines: { valueId: string; amountCents: number }[],
  ctx: { amountCents: number; enabledValueIds: Set<string>; kind: TxKind; hasOwnerAnswer: boolean }
): string[] {
  const errs: string[] = [];
  if (!lines.length) errs.push('no lines');
  for (const l of lines) {
    if (!Number.isInteger(l.amountCents)) errs.push(`line amount ${l.amountCents} is not integer cents`);
    if (!ctx.enabledValueIds.has(l.valueId)) errs.push(`account ${l.valueId} is not an enabled account`);
  }
  const sum = lines.reduce((s, l) => s + l.amountCents, 0);
  if (lines.length && sum !== ctx.amountCents) errs.push(`lines sum ${sum} ≠ transaction ${ctx.amountCents}`);
  if ((ctx.kind === 'own_transfer' || ctx.kind === 'p2p') && !ctx.hasOwnerAnswer) errs.push(`${ctx.kind === 'own_transfer' ? 'transfer between own accounts' : 'payment to a person'} cannot be coded without an owner answer`);
  return errs;
}
