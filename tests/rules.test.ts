import { describe, it, expect } from 'vitest';
import { validateRecommendation, validateLines } from '../src/lib/server/processes/validate';
import { classifyTxKind } from '../src/lib/server/processes/rules';
import { trigramSimilarity, normalizeMerchant } from '../src/lib/server/util';
import { parsePayoutCsv } from '../src/lib/server/processes/payouts';
import { readFileSync } from 'node:fs';
import { costUsd } from '../src/lib/server/ai/pricing';

const ctx = { amountCents: -1000, enabledValueIds: new Set(['dv_a', 'dv_b']), kind: 'card' as const, hasOwnerAnswer: false };

describe('MW.entry.validate', () => {
  it('accepts a valid single line', () => {
    expect(validateRecommendation({ action: 'code', lines: [{ valueId: 'dv_a', amountCents: -1000 }], memo: 'm', confidence: 0.9, reasoning: 'r', question: null }, ctx)).toEqual([]);
  });
  it('rejects bad sums, unknown/disabled accounts and non-integer cents', () => {
    const errs = validateLines([{ valueId: 'dv_x', amountCents: -999.5 }], ctx);
    expect(errs.join()).toMatch(/not an enabled account/);
    expect(errs.join()).toMatch(/not integer cents/);
    expect(errs.join()).toMatch(/sum/);
  });
  it('ask needs a question and no lines', () => {
    expect(validateRecommendation({ action: 'ask', lines: [], memo: '', confidence: 0.5, reasoning: '', question: '' }, ctx)).toContain('ask without a question');
  });
  it('never codes own transfers or person payments without an owner answer', () => {
    expect(validateLines([{ valueId: 'dv_a', amountCents: -1000 }], { ...ctx, kind: 'own_transfer' }).join()).toMatch(/transfer/);
    expect(validateLines([{ valueId: 'dv_a', amountCents: -1000 }], { ...ctx, kind: 'p2p', hasOwnerAnswer: true })).toEqual([]);
  });
});

describe('Tier 0 rules', () => {
  it('classifies transaction kinds', () => {
    expect(classifyTxKind('Book transfer from Slash Checking 4421', false)).toBe('own_transfer');
    expect(classifyTxKind('Zelle to J Smith', false)).toBe('p2p');
    expect(classifyTxKind('WHATNOT PAYOUT WN-8812', false)).toBe('payout');
    expect(classifyTxKind('USPS PO 1234', true)).toBe('card');
  });
  it('vendor name matching (trigram ≥ 0.6)', () => {
    expect(trigramSimilarity('Uline Inc', 'ULINE')).toBeGreaterThanOrEqual(0.6);
    expect(trigramSimilarity('Kicks Wholesale', 'Kicks Wholesale LLC')).toBeGreaterThanOrEqual(0.6);
    expect(trigramSimilarity('Amazon', 'USPS PO 1234')).toBeLessThan(0.6);
    expect(normalizeMerchant('USPS PO 1234')).toBe('usps');
  });
  it('payout CSV: valid file parses, bad file reports line numbers', () => {
    expect(parsePayoutCsv(readFileSync('fixtures/payouts/whatnot-2026-11.csv', 'utf8')).rows).toHaveLength(3);
    const bad = parsePayoutCsv(readFileSync('fixtures/payouts/bad.csv', 'utf8'));
    expect(bad.errors.join('\n')).toMatch(/line 2: gross − fees − shipping/);
    expect(bad.errors.join('\n')).toMatch(/line 3: date/);
  });
  it('cost formula matches the standard (Haiku 5.5)', () => {
    // 1000 fresh × 0.10 + 4000 read × 0.01 + 200 out × 0.50 per 1M = 0.00024
    expect(costUsd('claude-haiku-5-5', { fresh: 1000, cacheWrite: 0, cacheRead: 4000, out: 200 })).toBeCloseTo(0.00024, 8);
  });
});
