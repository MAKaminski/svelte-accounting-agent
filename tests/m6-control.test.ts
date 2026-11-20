import { describe, it, expect, beforeEach } from 'vitest';
import { setup } from './helpers';
import { pullEntries } from '../src/lib/server/processes/pull';
import { recommendEntry } from '../src/lib/server/processes/recommend';
import { approve, commitDue } from '../src/lib/server/processes/decide';
import { researchEntry } from '../src/lib/server/processes/research';
import { listMappings } from '../src/lib/server/processes/mappings';
import { getEntry, listEntries } from '../src/lib/server/processes/view';
import { setComponentState, listComponents, systemGraph, componentDetail, isEnabled } from '../src/lib/server/components';

const byMerchant = (name: string) => listEntries().find((e) => (e.merchantName ?? e.description) === name)!;

describe('M6 · control plane', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(); });

  it('graph covers every agent, process, tool, table and external system with edges', async () => {
    await pullEntries({ wait: true });
    const g = systemGraph();
    const kinds = (k: string) => g.nodes.filter((n) => n.kind === k).length;
    expect(kinds('agent')).toBe(2);
    expect(kinds('tool')).toBe(9);
    expect(kinds('table')).toBe(15);
    expect(kinds('external')).toBe(5); // QuickBooks, Anthropic, Ollama, Slash connection, Mercury (not connected)
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) { expect(ids.has(e.source)).toBe(true); expect(ids.has(e.target)).toBe(true); }
    expect(g.edges.some((e) => e.source === 'slash.write' && e.target === 'conn:conn_slash')).toBe(true);
    expect(g.nodes.find((n) => n.id === 'ext:Mercury API')!.status).toBe('idle');
    expect(g.nodes.find((n) => n.id === 'AI.entry.recommend')!.status).toBe('active');
  });

  it('required components cannot be switched off', () => {
    expect(() => setComponentState('MW.entry.validate', false, 'owner')).toThrow(/required/);
    expect(() => setComponentState('nope.nope', false, 'owner')).toThrow(/not found/);
  });

  it('recommend agent off → manual mode: zero model calls, entries still reviewable, node shows off', async () => {
    setComponentState('AI.entry.recommend', false, 'owner');
    await pullEntries({ wait: true });
    expect(ctx.model.calls.filter((c) => c.step === 'recommend')).toHaveLength(0);
    const e = byMerchant('Canva Pro');
    expect(e.state).toBe('recommended');
    expect(e.recommendation!.model).toBe('off:AI.entry.recommend');
    // A human can still code it by hand.
    const d = await approve(e.id, { lines: [{ valueId: 'dv_software', amountCents: e.amountCents }] });
    expect(d.state).toBe('ready');
    expect(systemGraph().nodes.find((n) => n.id === 'AI.entry.recommend')!.status).toBe('off');
    // Back on: the exact-input cache key includes the mode, so recommendations return.
    setComponentState('AI.entry.recommend', true, 'owner');
    const r = await recommendEntry(byMerchant('ULINE').id);
    expect(r.model).toContain('claude-haiku');
  });

  it('identify agent off → unknown profile, no identify call', async () => {
    setComponentState('AI.merchant.identify', false, 'owner');
    await pullEntries({ wait: true });
    expect(ctx.model.calls.filter((c) => c.step === 'identify')).toHaveLength(0);
    expect(getEntry(byMerchant('Pirate Ship').id)!.evidence.find((x) => x.kind === 'merchant_profile')!.summary).toMatch(/unknown/);
  });

  it('slash.write off → approvals are held, then sent when writes resume', async () => {
    await pullEntries({ wait: true });
    setComponentState('slash.write', false, 'owner');
    const id = byMerchant('Canva Pro').id;
    const d = await approve(id, {});
    expect(d.state).toBe('approved');
    expect(getEntry(id)!.stateReason).toMatch(/Held/);
    expect(ctx.slash.writes).toHaveLength(0);
    setComponentState('slash.write', true, 'owner');
    await commitDue();
    expect(getEntry(id)!.state).toBe('ready');
  });

  it('qbo.read off → research notes it and skips QuickBooks', async () => {
    await pullEntries({ wait: true });
    setComponentState('qbo.read', false, 'owner');
    const r = await researchEntry(byMerchant('ULINE').id);
    expect(r.notes.join()).toMatch(/qbo.read/);
  });

  it('mapping proposals off → no proposal after 3 consistent approvals', async () => {
    setComponentState('MW.mapping.propose', false, 'owner');
    await pullEntries({ wait: true });
    for (const e of listEntries().filter((x) => x.merchantName === 'USPS PO 1234')) await approve(e.id, {});
    expect(listMappings('proposed')).toHaveLength(0);
  });

  it('components list carries 7-day metrics and who changed the state', async () => {
    await pullEntries({ wait: true });
    setComponentState('model.ollama', false, 'lacey');
    const rec = listComponents('agent').find((c) => c.id === 'AI.entry.recommend')!;
    expect(rec.calls7d).toBeGreaterThan(10);
    expect(rec.costUsd7d).toBeGreaterThan(0);
    expect(rec.tier).toMatch(/Haiku/);
    const ol = listComponents('tool').find((c) => c.id === 'model.ollama')!;
    expect(ol).toMatchObject({ enabled: false, status: 'off', updatedBy: 'lacey' });
    expect(isEnabled('model.ollama')).toBe(false);
  });

  it('component detail has the live entry-state graph with this process’s transitions marked', async () => {
    await pullEntries({ wait: true });
    const d = componentDetail('AI.entry.recommend');
    expect(d.stateCounts.recommended).toBe(23);
    expect(d.transitions.filter((t) => t.mine).map((t) => t.to)).toEqual(expect.arrayContaining(['recommended', 'invalid']));
    expect(d.runs.length).toBeGreaterThan(0);
    expect(d.card!.steps.some((s) => s.kind === 'judgment')).toBe(true);
  });
});
