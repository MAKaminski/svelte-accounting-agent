import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { setup } from './helpers';
import { pullEntries } from '../src/lib/server/processes/pull';
import { recommendEntry } from '../src/lib/server/processes/recommend';
import { researchEntry } from '../src/lib/server/processes/research';
import { runEvals } from '../src/lib/server/processes/evals';
import { importPayouts } from '../src/lib/server/processes/payouts';
import { getEntry, listEntries } from '../src/lib/server/processes/view';
import { getDb, schema } from '../src/lib/server/db';

const byMerchant = (name: string) => listEntries().find((e) => (e.merchantName ?? e.description) === name)!;

describe('M2 · research + recommend', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(async () => { ctx = setup(); await pullEntries({ wait: true }); });

  it('USPS: history + QuickBooks + MCC evidence → Shipping & Postage ≥ 0.9', () => {
    const e = getEntry(byMerchant('USPS PO 1234').id)!;
    const kinds = e.evidence.map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(['slash_history', 'qbo_history', 'mcc']));
    expect(e.evidence.find((x) => x.kind === 'slash_history')!.summary).toMatch(/14 prior entries.*14× Shipping & Postage/);
    expect(e.recommendation!.lines[0].accountName).toBe('Shipping & Postage');
    expect(e.recommendation!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(e.state).toBe('recommended');
  });

  it('unknown merchant (Pirate Ship) gets a merchant profile from AI.merchant.identify', () => {
    const e = getEntry(byMerchant('Pirate Ship').id)!;
    expect(e.evidence.some((x) => x.kind === 'merchant_profile' && /shipping/.test(x.summary))).toBe(true);
    expect(ctx.model.calls.some((c) => c.step === 'identify')).toBe(true);
  });

  it('Amazon with mixed history asks a question naming both options', () => {
    const r = byMerchant('AMZN Mktp US').recommendation!;
    expect(r.action).toBe('ask');
    expect(r.question).toMatch(/Inventory/);
    expect(r.question).toMatch(/Supplies/);
  });

  it('own transfer and Zelle are guarded by rules — no model call, never coded', () => {
    for (const d of ['Book transfer from Slash Checking 4421', 'Zelle to J Smith']) {
      const r = byMerchant(d).recommendation!;
      expect(r.action).toBe('ask');
      expect(r.lines).toHaveLength(0);
      expect(r.model).toBe('rules:guard');
    }
  });

  it('logs tokens and cost per call; later calls read the cached prefix', () => {
    const recs = getDb().select().from(schema.recommendations).all().filter((r) => r.model.startsWith('fixture:'));
    expect(recs.length).toBeGreaterThan(10);
    expect(recs.every((r) => r.tokensFresh > 0 && r.tokensOut > 0)).toBe(true);
    const writes = recs.filter((r) => r.tokensCacheWrite > 0).length;
    const reads = recs.filter((r) => r.tokensCacheRead > 0).length;
    expect(writes).toBeLessThanOrEqual(2); // one per model route
    expect(reads).toBeGreaterThan(writes);
    expect(recs.every((r) => r.costUsd > 0)).toBe(true);
    // Cached prefix is above Haiku 5.5's 512-token cache minimum.
    expect(recs[0].tokensCacheWrite + recs[0].tokensCacheRead).toBeGreaterThan(512);
  });

  it('exact-input cache: re-recommending an unchanged entry makes no model call', async () => {
    const id = byMerchant('Canva Pro').id;
    const before = ctx.model.calls.length;
    const n = getDb().select().from(schema.recommendations).where(eq(schema.recommendations.entryId, id)).all().length;
    await recommendEntry(id);
    expect(ctx.model.calls.length).toBe(before);
    expect(getDb().select().from(schema.recommendations).where(eq(schema.recommendations.entryId, id)).all().length).toBe(n);
  });

  it('degraded mode: model down → entry invalid with "Model unavailable, retry"', async () => {
    const id = byMerchant('Canva Pro').id;
    ctx.model.failNext = 3; // first try, retry, Sonnet fallback all fail
    await expect(recommendEntry(id, { force: true })).rejects.toThrow();
    const e = getEntry(id)!;
    expect(e.state).toBe('invalid');
    expect(e.stateReason).toMatch(/MODEL: Model unavailable, retry/);
  });

  it('schema failure retries once and succeeds', async () => {
    const id = byMerchant('Canva Pro').id;
    ctx.model.invalidNext = 1;
    const r = await recommendEntry(id, { force: true });
    expect(r.action).toBe('code');
  });

  it('QuickBooks down: research continues and notes the partial source', async () => {
    ctx.qbo.failing = true;
    const id = byMerchant('ULINE').id;
    const r = await researchEntry(id);
    expect(r.notes.join()).toMatch(/QuickBooks unavailable/);
  });

  it('Whatnot payout: CSV import → payout_row evidence → Sonnet split of 3 lines summing to the deposit', async () => {
    await importPayouts(readFileSync('fixtures/payouts/whatnot-2026-11.csv', 'utf8'), 'whatnot', { wait: true });
    const e = getEntry(byMerchant('WHATNOT PAYOUT WN-8812').id)!;
    expect(e.evidence.some((x) => x.kind === 'payout_row')).toBe(true);
    expect(e.recommendation!.model).toContain('sonnet');
    expect(e.recommendation!.lines).toHaveLength(3);
    expect(e.recommendation!.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(184210);
    expect(e.state).toBe('recommended');
  });
});

describe('M2 · eval harness', () => {
  it('seed cases pass 6/6 (fixture model)', async () => {
    setup();
    const r = await runEvals();
    expect(r.cases.filter((c) => !c.pass)).toEqual([]);
    expect(r.passed).toBe(6);
  });
});
