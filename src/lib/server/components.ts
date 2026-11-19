// Control plane: the component registry (processes + tools from processes.yaml) joined with
// per-component on/off state and 7-day run metrics. Powers /system and isEnabled() checks.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { eq, gte } from 'drizzle-orm';
import { getDb, schema } from './db';
import { AppError, nowIso } from './util';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Component, ComponentDetail, SystemGraph } from '$lib/types';

type Step = { kind: 'rule' | 'judgment' | 'human'; does: string; tier?: string; evals?: string[] };
export interface ProcessDef { trigger: string; input: string; steps: Step[]; output: string; writes: string[]; fails: string; accept: string; budget: { p95_ms: number; usd: number }; toggle: boolean; whenOff?: string }
export interface ToolDef { target: string; port: string; ops: string[]; usedBy: string[]; toggle: boolean; whenOff?: string }
export interface Registry {
  processes: Record<string, ProcessDef>;
  tools: Record<string, ToolDef>;
  interactions: Record<string, string>[];
  traces: { name: string; actor: string; trigger: string; processes: string[]; end: string }[];
}

let cached: Registry | null = null;
export function registry(): Registry {
  if (!cached) cached = parse(readFileSync(resolve(process.cwd(), 'processes.yaml'), 'utf8')) as Registry;
  return cached;
}

export function kindOf(id: string): Component['kind'] {
  const r = registry();
  if (r.tools[id]) return 'tool';
  const p = r.processes[id];
  if (!p) throw new AppError('not_found', `component ${id} not found`, 404);
  if (p.steps.some((s) => s.kind === 'judgment')) return 'agent';
  if (p.steps.some((s) => s.kind === 'human')) return 'human';
  return 'rule';
}

const layerOf = (id: string, kind: Component['kind']) => (kind === 'tool' ? 'TOOLS' : id.split('.')[0]) as Component['layer'];

/** Absent row = enabled. Components with toggle: false are always enabled. */
export function isEnabled(id: string): boolean {
  const r = registry();
  const def = r.processes[id] ?? r.tools[id];
  if (!def?.toggle) return true;
  const row = getDb().select().from(schema.componentStates).where(eq(schema.componentStates.componentId, id)).get();
  return row ? row.enabled : true;
}

export function setComponentState(id: string, enabled: boolean, by: string): Component {
  const r = registry();
  const def = r.processes[id] ?? r.tools[id];
  if (!def) throw new AppError('not_found', `component ${id} not found`, 404);
  if (!def.toggle && !enabled) throw new AppError('not_toggleable', `${id} is required and cannot be switched off`, 400);
  const db = getDb();
  const values = { componentId: id, enabled, configJson: null, updatedBy: by, updatedAt: nowIso() };
  db.insert(schema.componentStates).values(values).onConflictDoUpdate({ target: schema.componentStates.componentId, set: values }).run();
  return listComponents().find((c) => c.id === id)!;
}

interface Metrics { calls: number; failures: number; p95Ms: number | null; lastRunAt: string | null; lastStatus: string | null; costUsd: number; cacheReadShare: number | null }

function metrics(): Map<string, Metrics> {
  const db = getDb();
  const since = nowIso(new Date(Date.now() - 7 * 86_400_000));
  const runs = db.select().from(schema.runs).where(gte(schema.runs.startedAt, since)).all();
  const byProc = new Map<string, typeof runs>();
  for (const r of runs) byProc.set(r.processId, [...(byProc.get(r.processId) ?? []), r]);
  const out = new Map<string, Metrics>();
  for (const [id, rs] of byProc) {
    const durs = rs.map((r) => (r.detailJson ? (JSON.parse(r.detailJson).e2e_ms as number | undefined) : undefined)).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
    const last = rs.reduce((a, b) => (a.startedAt > b.startedAt ? a : b));
    out.set(id, {
      calls: rs.length, failures: rs.filter((r) => r.status === 'failed').length,
      p95Ms: durs.length ? durs[Math.min(durs.length - 1, Math.floor(durs.length * 0.95))] : null,
      lastRunAt: last.startedAt, lastStatus: last.status, costUsd: 0, cacheReadShare: null
    });
  }
  // Model cost + cache share for the recommend agent (from recommendations, the per-call source of truth).
  const recs = db.select().from(schema.recommendations).where(gte(schema.recommendations.createdAt, since)).all();
  const m = out.get('AI.entry.recommend');
  if (m) {
    m.costUsd = recs.reduce((s, r) => s + r.costUsd, 0);
    const read = recs.reduce((s, r) => s + r.tokensCacheRead, 0);
    const total = recs.reduce((s, r) => s + r.tokensFresh + r.tokensCacheWrite + r.tokensCacheRead, 0);
    m.cacheReadShare = total ? read / total : null;
  }
  return out;
}

const SOURCE_BY_TARGET: Record<string, string> = { 'Slash API': 'slash', 'QuickBooks API': 'qbo', Anthropic: 'model', Ollama: 'model' };

export function listComponents(kind?: Component['kind']): Component[] {
  const r = registry();
  const db = getDb();
  const states = new Map(db.select().from(schema.componentStates).all().map((s) => [s.componentId, s]));
  const mets = metrics();
  const lastEval = lastEvalRun();
  const zero: Metrics = { calls: 0, failures: 0, p95Ms: null, lastRunAt: null, lastStatus: null, costUsd: 0, cacheReadShare: null };

  const status = (enabled: boolean, m: Metrics): Component['status'] =>
    !enabled ? 'off' : m.calls === 0 ? 'idle' : m.lastStatus === 'failed' || m.failures / m.calls > 0.2 ? 'degraded' : 'active';

  const procs: Component[] = Object.entries(r.processes).map(([id, p]) => {
    const k = kindOf(id);
    const st = states.get(id);
    const enabled = p.toggle ? (st?.enabled ?? true) : true;
    const m = mets.get(id) ?? zero;
    const judgment = p.steps.find((s) => s.kind === 'judgment');
    const evalCases = judgment?.evals ?? [];
    const evalRes = lastEval?.cases.filter((c) => evalCases.includes(c.caseId)) ?? [];
    return {
      id, kind: k, layer: layerOf(id, k), label: id, summary: p.steps.map((s) => s.does).join(' → '),
      toggle: p.toggle, whenOff: p.whenOff ?? null, enabled, status: status(enabled, m),
      tier: judgment?.tier ?? null, promptVersion: k === 'agent' ? (id === 'AI.entry.recommend' ? 'recommend.v1' : 'identify.v1') : null,
      target: null, usedBy: [], writes: p.writes,
      evalPassRate: evalRes.length ? evalRes.filter((c) => c.pass).length / evalRes.length : null,
      calls7d: m.calls, failures7d: m.failures, p95Ms: m.p95Ms, costUsd7d: m.costUsd, cacheReadShare: m.cacheReadShare,
      lastRunAt: m.lastRunAt, updatedBy: st?.updatedBy ?? null, updatedAt: st?.updatedAt ?? null
    };
  });

  const tools: Component[] = Object.entries(r.tools).map(([id, t]) => {
    const st = states.get(id);
    const enabled = t.toggle ? (st?.enabled ?? true) : true;
    // Tool health = runs of the processes that use it; failures counted only when the upstream was this tool's target.
    const src = SOURCE_BY_TARGET[t.target];
    let calls = 0, failures = 0, lastRunAt: string | null = null;
    for (const p of t.usedBy) {
      const rs = db.select().from(schema.runs).where(eq(schema.runs.processId, p)).all();
      calls += rs.length;
      failures += rs.filter((x) => x.status === 'failed' && x.detailJson && JSON.parse(x.detailJson).source === src).length;
      for (const x of rs) if (!lastRunAt || x.startedAt > lastRunAt) lastRunAt = x.startedAt;
    }
    const m: Metrics = { ...zero, calls, failures, lastRunAt, lastStatus: failures && calls && failures / calls > 0.2 ? 'failed' : 'ok' };
    return {
      id, kind: 'tool' as const, layer: 'TOOLS' as const, label: id, summary: `${t.port}: ${t.ops.join(', ')}`,
      toggle: t.toggle, whenOff: t.whenOff ?? null, enabled, status: status(enabled, m), tier: null, promptVersion: null,
      target: t.target, usedBy: t.usedBy, writes: [], evalPassRate: null,
      calls7d: calls, failures7d: failures, p95Ms: null, costUsd7d: 0, cacheReadShare: null,
      lastRunAt, updatedBy: st?.updatedBy ?? null, updatedAt: st?.updatedAt ?? null
    };
  });
  const all = [...procs, ...tools];
  return kind ? all.filter((c) => c.kind === kind) : all;
}

function lastEvalRun(): { cases: { caseId: string; pass: boolean }[] } | null {
  const rows = getDb().select().from(schema.runs).where(eq(schema.runs.processId, 'IN.evals.run')).all()
    .filter((r) => r.detailJson?.includes('evalRun')).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return rows[0] ? JSON.parse(rows[0].detailJson!).evalRun : null;
}

export function systemGraph(): SystemGraph {
  const r = registry();
  const comps = listComponents();
  const tables = (Object.values(schema) as unknown[]).filter((v): v is SQLiteTable => v instanceof SQLiteTable).map((t) => getTableConfig(t).name);
  const targets = [...new Set(Object.values(r.tools).map((t) => t.target))];
  const nodes: SystemGraph['nodes'] = [
    ...comps.map((c) => ({ id: c.id, label: c.label, kind: c.kind, layer: c.layer, status: c.status, toggle: c.toggle })),
    ...tables.map((t) => ({ id: `table:${t}`, label: t, kind: 'table' as const, layer: 'BE' as const, status: 'active' as const, toggle: false })),
    ...targets.map((t) => ({ id: `ext:${t}`, label: t, kind: 'external' as const, layer: 'EXT' as const, status: 'active' as const, toggle: false }))
  ];
  const edges = new Map<string, SystemGraph['edges'][number]>();
  const add = (source: string, target: string, kind: SystemGraph['edges'][number]['kind']) => {
    const id = `${source}->${target}`;
    if (source !== target && !edges.has(id)) edges.set(id, { id, source, target, kind });
  };
  for (const t of r.traces) for (let i = 1; i < t.processes.length; i++) add(t.processes[i - 1], t.processes[i], 'flow');
  for (const [id, p] of Object.entries(r.processes)) for (const w of p.writes) add(id, `table:${w}`, 'writes');
  for (const [id, t] of Object.entries(r.tools)) {
    for (const p of t.usedBy) add(p, id, 'uses');
    add(id, `ext:${t.target}`, 'calls');
  }
  return { nodes, edges: [...edges.values()] };
}

/** Entry-state machine with live counts; transitions name the process that causes them. */
export const ENTRY_TRANSITIONS: [string, string, string][] = [
  ['start', 'fetched', 'MW.entries.pull'], ['fetched', 'researched', 'MW.entry.research'],
  ['researched', 'recommended', 'AI.entry.recommend'], ['researched', 'invalid', 'AI.entry.recommend'], ['invalid', 'recommended', 'AI.entry.recommend'],
  ['recommended', 'fetched', 'MW.entries.pull'], ['recommended', 'asked', 'FE.entry.ask'], ['asked', 'researched', 'FE.question.answer'],
  ['recommended', 'approved', 'FE.entry.approve'], ['invalid', 'approved', 'FE.entry.approve'], ['approved', 'recommended', 'FE.entry.undo'],
  ['approved', 'coded', 'MW.entry.code'], ['approved', 'recommended', 'MW.entry.code'], ['coded', 'ready', 'MW.entry.ready'],
  ['ready', 'synced', 'MW.entries.pull'], ['recommended', 'rejected', 'FE.entry.reject'], ['asked', 'rejected', 'FE.entry.reject']
];

export function componentDetail(id: string): ComponentDetail {
  const r = registry();
  const c = listComponents().find((x) => x.id === id);
  if (!c) throw new AppError('not_found', `component ${id} not found`, 404);
  const db = getDb();
  const counts: Record<string, number> = {};
  for (const e of db.select({ s: schema.accountingEntries.localState }).from(schema.accountingEntries).all()) counts[e.s] = (counts[e.s] ?? 0) + 1;
  const runs = db.select().from(schema.runs).where(eq(schema.runs.processId, id)).all()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20)
    .map((x) => ({ id: x.id, subjectId: x.subjectId, startedAt: x.startedAt, status: x.status, error: x.error, e2eMs: x.detailJson ? (JSON.parse(x.detailJson).e2e_ms ?? null) : null }));
  const p = r.processes[id];
  const t = r.tools[id];
  return {
    ...c,
    card: p ? { trigger: p.trigger, input: p.input, steps: p.steps, output: p.output, fails: p.fails, accept: p.accept, budget: p.budget } : null,
    tool: t ? { port: t.port, ops: t.ops } : null,
    traces: r.traces.filter((tr) => tr.processes.includes(id) || (t && t.usedBy.some((u) => tr.processes.includes(u)))).map((tr) => tr.name),
    stateCounts: counts,
    transitions: ENTRY_TRANSITIONS.map(([from, to, by]) => ({ from, to, by, mine: by === id || (!!t && t.usedBy.includes(by)) })),
    runs
  };
}
