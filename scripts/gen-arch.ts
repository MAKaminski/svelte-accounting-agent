// pnpm arch        → regenerate the <!-- gen:* --> blocks in ARCHITECTURE.md
// pnpm arch:check  → fail if blocks are stale or the registries don't tick and tie.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '../src/lib/server/db/schema';
import { commands } from '../src/lib/commands';

type Step = { kind: 'rule' | 'judgment' | 'human'; does: string; tier?: string; evals?: string[] };
type Proc = { trigger: string; input: string; steps: Step[]; output: string; writes: string[]; fails: string; accept: string; budget: { p95_ms: number; usd: number } };
type Registry = {
  processes: Record<string, Proc>;
  interactions: Record<string, string>[];
  traces: { name: string; actor: string; trigger: string; processes: string[]; end: string }[];
};

const reg = parse(readFileSync('processes.yaml', 'utf8')) as Registry;
const tables = Object.values(schema).filter((v): v is SQLiteTable => v instanceof SQLiteTable);
const esc = (s: string) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (s: string) => '`' + s + '`';

const blocks: Record<string, string> = {};

// ERD — every table, every foreign key, generated from the Drizzle schema.
{
  const lines = ['```mermaid', 'erDiagram'];
  const cfgs = tables.map((t) => getTableConfig(t));
  for (const c of cfgs) {
    for (const fk of c.foreignKeys) {
      const ref = fk.reference();
      lines.push(`  ${getTableConfig(ref.foreignTable).name} ||--o{ ${c.name} : ${ref.columns.map((x) => x.name).join('_')}`);
    }
  }
  for (const c of cfgs) {
    const fkCols = new Set(c.foreignKeys.flatMap((fk) => fk.reference().columns.map((x) => x.name)));
    lines.push(`  ${c.name} {`);
    for (const col of c.columns) {
      const t = col.columnType.includes('Integer') ? 'int' : col.columnType.includes('Real') ? 'real' : 'text';
      const key = col.primary ? ' PK' : fkCols.has(col.name) ? ' FK' : '';
      lines.push(`    ${t} ${col.name}${key}`);
    }
    lines.push('  }');
  }
  lines.push('```');
  blocks.erd = lines.join('\n');
}

// State cards: table → writers.
{
  const writers = new Map<string, string[]>();
  for (const [id, p] of Object.entries(reg.processes)) for (const w of p.writes) writers.set(w, [...(writers.get(w) ?? []), id]);
  const rows = tables.map((t) => getTableConfig(t).name).map((n) => `| ${code(n)} | ${(writers.get(n) ?? ['—']).map(code).join(', ')} |`);
  blocks.states = ['| Component (table) | Written by |', '|---|---|', ...rows].join('\n');
}

// CLI table.
{
  const rows = commands.map((c) => {
    const pos = c.params.filter((p) => p.kind === 'positional').map((p) => code(`<${p.name}>`));
    const flags = c.params.filter((p) => p.kind === 'flag').map((p) => code(`--${p.name}`));
    const exits = c.method === 'GET' ? '0 · 1 · 2' : '0 · 1 · 2';
    return `| ${code(`books ${c.noun} ${c.verb}`)} | ${[...pos, ...flags, code('--json')].join(' ')} | ${esc(c.summary)} | ${exits} | ${code(`${c.method} ${c.path}`)} | ${code(c.process)} |`;
  });
  blocks.cli = ['| Command | Args / flags | Does | Exit codes | Calls | Process |', '|---|---|---|---|---|---|', ...rows].join('\n');
}

// UI actions.
{
  const rows = commands
    .filter((c) => c.method === 'POST' && c.screen)
    .map((c) => `| ${esc(c.summary)} | ${code(c.screen!)} | ${c.shortcut ? code(c.shortcut) : '—'} | ${code(`${c.method} ${c.path}`)} | ${c.feedback ?? '—'} | ${c.confirm ?? '—'} |`);
  blocks.actions = [
    '| Action | Screen | Shortcut | Calls | Feedback ≤ 100 ms | Confirm / undo |',
    '|---|---|---|---|---|---|',
    ...rows,
    '| Command palette | everywhere | `⌘K` | any registry command | opens instantly | — |'
  ].join('\n');
}

// Process directory.
{
  const rows = Object.entries(reg.processes).map(([id, p]) => {
    const steps = p.steps.map((s) => `**${s.kind}**${s.tier ? ` (${s.tier})` : ''}: ${esc(s.does)}`).join('<br>');
    return `| ${code(id)} | ${esc(p.trigger)} | ${esc(p.input)} | ${steps} | ${esc(p.output)} | ${esc(p.fails)} | ${esc(p.accept)} | ${p.budget.p95_ms} ms · $${p.budget.usd} |`;
  });
  blocks.processes = ['| ID | Trigger | Input | Processing | Output | Fails as | Accept | Budget (p95 · $/run) |', '|---|---|---|---|---|---|---|---|', ...rows].join('\n');
}

blocks.interactions = [
  '| From | To | Via | Sync | Payload | Timeout / retry / fallback |',
  '|---|---|---|---|---|---|',
  ...reg.interactions.map((i) => `| ${code(i.from)} | ${i.to} | ${i.via} | ${i.sync} | ${esc(i.payload)} | ${esc(i.timeout)} |`)
].join('\n');

blocks.traces = [
  '| Use case | Actor | Trigger | Processes | End state |',
  '|---|---|---|---|---|',
  ...reg.traces.map((t) => `| ${t.name} | ${t.actor} | ${esc(t.trigger)} | ${t.processes.map(code).join(' → ')} | ${esc(t.end)} |`)
].join('\n');

// ---------- checks ----------
const problems: string[] = [];
const procIds = new Set(Object.keys(reg.processes));
const tableNames = new Set(tables.map((t) => getTableConfig(t).name));
const evalIds = new Set((JSON.parse(readFileSync('fixtures/evals/seed.json', 'utf8')) as { id: string }[]).map((c) => c.id));

for (const c of commands) {
  if (`${c.noun}.${c.verb}` !== c.name) problems.push(`command ${c.name}: name must be noun.verb`);
  if (!/^[a-z]+$/.test(c.noun) || !/^[a-z]+$/.test(c.verb)) problems.push(`command ${c.name}: off-grammar noun/verb`);
  if (!procIds.has(c.process)) problems.push(`command ${c.name}: process ${c.process} not in processes.yaml`);
  const file = 'src/routes' + c.path.replace(/:(\w+)/g, '[$1]') + '/+server.ts';
  if (!existsSync(file)) problems.push(`command ${c.name}: no route file ${file}`);
  else if (!new RegExp(`export const ${c.method}\\b`).test(readFileSync(file, 'utf8'))) problems.push(`command ${c.name}: ${file} does not export ${c.method}`);
  if (c.screen && !existsSync(`src/routes/(app)${c.screen}/+page.svelte`)) problems.push(`command ${c.name}: screen ${c.screen} has no page (mockup)`);
}

const traced = new Set(reg.traces.flatMap((t) => t.processes));
for (const t of reg.traces) for (const p of t.processes) if (!procIds.has(p)) problems.push(`trace "${t.name}": unknown process ${p}`);
for (const [id, p] of Object.entries(reg.processes)) {
  if (!/^(FE|BE|MW|AI|IN)\.[a-z]+\.[a-z]+$/.test(id)) problems.push(`process ${id}: ID must be <LAYER>.<noun>.<verb>`);
  if (!traced.has(id)) problems.push(`process ${id}: appears in no use-case trace`);
  if (!p.input || !p.output) problems.push(`process ${id}: untyped input or output`);
  for (const s of p.steps) {
    if (s.kind !== 'judgment') continue;
    if (!s.evals?.length) problems.push(`process ${id}: judgment step has no eval pairs`);
    for (const e of s.evals ?? []) if (!evalIds.has(e)) problems.push(`process ${id}: eval ${e} not in fixtures/evals/seed.json`);
    if (!s.tier) problems.push(`process ${id}: judgment step has no tier`);
  }
  for (const w of p.writes) if (!tableNames.has(w)) problems.push(`process ${id}: writes unknown table ${w}`);
}
const written = new Set(Object.values(reg.processes).flatMap((p) => p.writes));
for (const t of tableNames) if (!written.has(t)) problems.push(`table ${t}: written by no process`);

// ---------- render ----------
const path = 'ARCHITECTURE.md';
const doc = readFileSync(path, 'utf8');
let next = doc;
for (const [k, v] of Object.entries(blocks)) {
  const re = new RegExp(`(<!-- gen:${k} -->)[\\s\\S]*?(<!-- /gen:${k} -->)`);
  if (!re.test(next)) { problems.push(`ARCHITECTURE.md: missing block gen:${k}`); continue; }
  next = next.replace(re, (_m, a: string, b: string) => `${a}\n${v}\n${b}`);
}

if (process.argv.includes('--check')) {
  if (next !== doc) problems.push('ARCHITECTURE.md generated blocks are stale — run pnpm arch');
  if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
  console.error(`✓ arch check: ${commands.length} commands, ${procIds.size} processes, ${reg.traces.length} traces, ${tableNames.size} tables tick and tie`);
} else {
  writeFileSync(path, next);
  if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
  console.error('ARCHITECTURE.md regenerated');
}
