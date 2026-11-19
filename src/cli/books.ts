#!/usr/bin/env node
// `books` CLI — generated from src/lib/commands.ts. Grammar: books <noun> <verb> [args] [flags].
// Data → stdout, logs → stderr. Exit 0 ok · 1 user error · 2 upstream/system error.
import { readFileSync } from 'node:fs';
import { commands, buildPath, camel, type Command } from '../lib/commands';
import { format } from './format';

const out = (s: string) => process.stdout.write(s.endsWith('\n') ? s : s + '\n');
const err = (s: string) => process.stderr.write(s.endsWith('\n') ? s : s + '\n');

function globalHelp(): string {
  const w = Math.max(...commands.map((c) => `${c.noun} ${c.verb}`.length));
  const lines = commands.map((c) => `  ${`${c.noun} ${c.verb}`.padEnd(w)}  ${c.summary}${c.writesSlash ? ' [writes to Slash]' : ''}`);
  return `books — LaceLuxx Books agent CLI\n\nUsage: books <noun> <verb> [args] [flags]\n\nCommands:\n${lines.join('\n')}\n\nGlobal flags:\n  --json   Machine-readable output (same schema as the API)\n  --help   Help for any command\n\nEnv: BOOKS_URL (default http://localhost:5173), APP_PASSCODE\nExit codes: 0 ok · 1 user error · 2 upstream/system error\n`;
}

function commandHelp(c: Command): string {
  const pos = c.params.filter((p) => p.kind === 'positional').map((p) => `<${p.name}>`).join(' ');
  const flags = c.params.filter((p) => p.kind === 'flag');
  const fl = [...flags.map((p) => `  --${p.name}${p.type === 'boolean' ? '' : ' <value>'}`.padEnd(26) + p.help + (p.required ? ' (required)' : '')),
    '  --json'.padEnd(26) + 'Machine-readable output', '  --help'.padEnd(26) + 'This help'];
  const args = c.params.filter((p) => p.kind === 'positional').map((p) => `  <${p.name}>`.padEnd(26) + p.help);
  return `books ${c.noun} ${c.verb} ${pos}\n\n${c.summary}\n\nCalls: ${c.method} ${c.path}   Process: ${c.process}${c.writesSlash ? '\nWrites to Slash: requires --yes; supports --dry-run' : ''}\n${args.length ? `\nArguments:\n${args.join('\n')}\n` : ''}\nFlags:\n${fl.join('\n')}\n`;
}

async function main(argv: string[]): Promise<number> {
  const [noun, verb, ...rest] = argv;
  if (!noun || noun === '--help' || noun === '-h' || noun === 'help') { out(globalHelp()); return noun ? 0 : 1; }
  const cmd = commands.find((c) => c.noun === noun && c.verb === verb);
  if (!cmd) {
    const nounCmds = commands.filter((c) => c.noun === noun);
    err(nounCmds.length ? `error: unknown verb "${verb ?? ''}" for ${noun}. Try: ${nounCmds.map((c) => c.verb).join(', ')}` : `error: unknown command "${noun}". Run books --help`);
    return 1;
  }
  const values: Record<string, unknown> = {};
  const positionals: string[] = [];
  let asJson = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--help' || a === '-h') { out(commandHelp(cmd)); return 0; }
    if (a === '--json') { asJson = true; continue; }
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=', 2);
      const p = cmd.params.find((x) => x.name === k && x.kind === 'flag');
      if (!p) { err(`error: unknown flag --${k} for books ${noun} ${verb}`); return 1; }
      if (p.type === 'boolean') values[camel(k)] = inline === undefined ? true : inline !== 'false';
      else { const v = inline ?? rest[++i]; if (v === undefined) { err(`error: --${k} needs a value`); return 1; } values[camel(k)] = v; }
      continue;
    }
    positionals.push(a);
  }
  const posParams = cmd.params.filter((p) => p.kind === 'positional');
  for (const [i, p] of posParams.entries()) {
    if (positionals[i] === undefined) { if (p.required) { err(`error: missing <${p.name}>\n\n${commandHelp(cmd)}`); return 1; } continue; }
    values[camel(p.name)] = p.type === 'file' ? readFileOr(positionals[i]) : positionals[i];
    if (values[camel(p.name)] === null) { err(`error: cannot read file ${positionals[i]}`); return 1; }
  }
  for (const p of cmd.params) if (p.required && values[camel(p.name)] === undefined) { err(`error: --${p.name} is required`); return 1; }
  if (cmd.writesSlash && !values.yes && !values.dryRun) { err(`error: books ${noun} ${verb} writes to Slash; pass --yes to confirm or --dry-run to preview`); return 1; }

  const base = (process.env.BOOKS_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  const body = Object.fromEntries(cmd.params.filter((p) => p.in === 'body' && values[camel(p.name)] !== undefined).map((p) => [camel(p.name), values[camel(p.name)]]));
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.APP_PASSCODE) headers['x-books-passcode'] = process.env.APP_PASSCODE;
  let res: Response;
  try {
    res = await fetch(base + buildPath(cmd, values), { method: cmd.method, headers, body: cmd.method === 'GET' ? undefined : JSON.stringify(body) });
  } catch {
    err(`error: server not reachable at ${base} — run pnpm dev (or set BOOKS_URL)`);
    return 2;
  }
  const data = await res.json().catch(() => null) as { error?: { code: string; message: string; source?: string } } | null;
  if (!res.ok || !data || data.error) {
    const e = data?.error;
    err(`error: ${e?.message ?? `HTTP ${res.status}`}${e?.source && e.source !== 'app' ? ` [${e.source}]` : ''}`);
    return res.status >= 500 ? 2 : 1;
  }
  out(asJson ? JSON.stringify(data, null, 2) : format(cmd.name, data, values));
  if (cmd.name === 'evals.run' && (data as unknown as { passed: number; total: number }).passed < (data as unknown as { total: number }).total) return 1;
  return 0;
}

function readFileOr(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { err(`error: ${(e as Error).message}`); process.exit(2); });
