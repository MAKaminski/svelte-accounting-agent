// THE command registry. CLI commands, --help, the ⌘K palette, keyboard shortcuts,
// API route checks and the ARCHITECTURE.md interface tables are generated from this list.
// Grammar: books <noun> <verb> [args] [flags]. Every entry names the process it triggers.
import { z } from 'zod';
import * as T from './types';

export type ParamIn = 'path' | 'query' | 'body';
export interface Param {
  name: string;
  kind: 'positional' | 'flag';
  type: 'string' | 'boolean' | 'file';
  in: ParamIn;
  required?: boolean;
  help: string;
}

export interface Command {
  name: string; // noun.verb
  noun: string;
  verb: string;
  summary: string;
  method: 'GET' | 'POST';
  path: string; // /api/... with :id
  params: Param[];
  returns: z.ZodTypeAny;
  process: string; // processes.yaml id
  /** Writes to Slash: CLI requires --yes and supports --dry-run. */
  writesSlash?: boolean;
  shortcut?: string;
  screen?: string; // UI route where the action lives
  feedback?: string;
  confirm?: string;
}

const id = (help = 'Entry id (ae_…)'): Param => ({ name: 'id', kind: 'positional', type: 'string', in: 'path', required: true, help });
const yes: Param = { name: 'yes', kind: 'flag', type: 'boolean', in: 'body', help: 'Confirm a write to Slash' };
const dryRun: Param = { name: 'dry-run', kind: 'flag', type: 'boolean', in: 'body', help: 'Show what would be written; write nothing' };

export const commands: Command[] = [
  {
    name: 'entries.pull', noun: 'entries', verb: 'pull', summary: 'Pull entries in review from Slash, then research and recommend',
    method: 'POST', path: '/api/entries/pull',
    params: [
      { name: 'since', kind: 'flag', type: 'string', in: 'body', help: 'Only entries created on/after this date (YYYY-MM-DD)' },
      dryRun
    ],
    returns: T.PullResultSchema, process: 'MW.entries.pull', shortcut: 'p', screen: '/queue', feedback: 'Spinner on button'
  },
  {
    name: 'entries.list', noun: 'entries', verb: 'list', summary: 'List local entries',
    method: 'GET', path: '/api/entries',
    params: [{ name: 'state', kind: 'flag', type: 'string', in: 'query', help: 'Filter by local state (e.g. recommended, asked, invalid)' }],
    returns: z.array(T.EntrySchema), process: 'FE.entries.list', screen: '/queue'
  },
  {
    name: 'entry.show', noun: 'entry', verb: 'show', summary: 'Show one entry with evidence and decisions',
    method: 'GET', path: '/api/entries/:id', params: [id()],
    returns: T.EntryDetailSchema, process: 'FE.entries.list', screen: '/entry/[id]'
  },
  {
    name: 'entry.recommend', noun: 'entry', verb: 'recommend', summary: 'Research and recommend one entry',
    method: 'POST', path: '/api/entries/:id/recommend',
    params: [id(), { name: 'force', kind: 'flag', type: 'boolean', in: 'body', help: 'Ignore the exact-input cache' }],
    returns: T.RecommendationSchema, process: 'AI.entry.recommend', shortcut: 'R', screen: '/entry/[id]', feedback: 'Spinner'
  },
  {
    name: 'entry.approve', noun: 'entry', verb: 'approve', summary: 'Approve: code the entry in Slash and mark it ready to sync',
    method: 'POST', path: '/api/entries/:id/approve',
    params: [
      id(), yes, dryRun,
      { name: 'override', kind: 'flag', type: 'boolean', in: 'body', help: 'Approve even with an open question' },
      { name: 'lines', kind: 'flag', type: 'string', in: 'body', help: 'Edited lines as JSON [{valueId, amountCents, description?}]' },
      { name: 'memo', kind: 'flag', type: 'string', in: 'body', help: 'Edited memo' },
      { name: 'later', kind: 'flag', type: 'boolean', in: 'body', help: 'Hold for the undo window instead of writing now' }
    ],
    returns: T.DecisionSchema, process: 'FE.entry.approve', writesSlash: true, shortcut: 'a', screen: '/queue',
    feedback: 'Row fades, toast with Undo', confirm: 'Undo for 10 s'
  },
  {
    name: 'entry.undo', noun: 'entry', verb: 'undo', summary: 'Undo an approval still inside its undo window',
    method: 'POST', path: '/api/entries/:id/undo', params: [id()],
    returns: T.DecisionSchema, process: 'FE.entry.undo', shortcut: 'u', screen: '/queue', feedback: 'Row returns'
  },
  {
    name: 'entry.ask', noun: 'entry', verb: 'ask', summary: 'Open a question for the owner',
    method: 'POST', path: '/api/entries/:id/ask',
    params: [id(), { name: 'text', kind: 'flag', type: 'string', in: 'body', help: 'Question text (defaults to the recommendation\'s question)' }],
    returns: T.QuestionSchema, process: 'FE.entry.ask', shortcut: 'q', screen: '/entry/[id]', feedback: 'Toast'
  },
  {
    name: 'entry.reject', noun: 'entry', verb: 'reject', summary: 'Reject the recommendation; the entry is coded by hand in Slash',
    method: 'POST', path: '/api/entries/:id/reject',
    params: [id(), yes, { name: 'reason', kind: 'flag', type: 'string', in: 'body', help: 'Why' }],
    returns: T.DecisionSchema, process: 'FE.entry.reject', shortcut: 'x', screen: '/entry/[id]', feedback: 'Toast', confirm: 'Requires --yes'
  },
  {
    name: 'questions.list', noun: 'questions', verb: 'list', summary: 'List questions for the owner',
    method: 'GET', path: '/api/questions',
    params: [{ name: 'status', kind: 'flag', type: 'string', in: 'query', help: 'open | answered' }],
    returns: z.array(T.QuestionSchema), process: 'FE.questions.list', screen: '/questions'
  },
  {
    name: 'question.answer', noun: 'question', verb: 'answer', summary: 'Answer a question; the entry is re-recommended with the answer',
    method: 'POST', path: '/api/questions/:id/answer',
    params: [id('Question id (q_…)'), { name: 'text', kind: 'flag', type: 'string', in: 'body', required: true, help: 'The answer' }],
    returns: T.QuestionSchema, process: 'FE.question.answer', shortcut: 'Enter', screen: '/questions', feedback: 'Row moves to answered'
  },
  {
    name: 'mappings.list', noun: 'mappings', verb: 'list', summary: 'List learned rules',
    method: 'GET', path: '/api/mappings',
    params: [{ name: 'status', kind: 'flag', type: 'string', in: 'query', help: 'proposed | applied | dismissed' }],
    returns: z.array(T.MappingProposalSchema), process: 'FE.mappings.list', screen: '/mappings'
  },
  {
    name: 'mapping.apply', noun: 'mapping', verb: 'apply', summary: 'Write a learned rule to Slash (recodes entries still in review)',
    method: 'POST', path: '/api/mappings/:id/apply',
    params: [id('Mapping proposal id (mp_…)'), yes, dryRun],
    returns: T.MappingProposalSchema, process: 'FE.mapping.apply', writesSlash: true, shortcut: 'r', screen: '/mappings',
    feedback: 'Spinner', confirm: 'Confirm dialog'
  },
  {
    name: 'coa.pull', noun: 'coa', verb: 'pull', summary: 'Pull the chart of accounts (Slash account dimension)',
    method: 'POST', path: '/api/coa/pull', params: [dryRun],
    returns: T.CoaPullSchema, process: 'MW.coa.pull', screen: '/settings', feedback: 'Spinner'
  },
  {
    name: 'coa.list', noun: 'coa', verb: 'list', summary: 'List accounts from the local chart of accounts',
    method: 'GET', path: '/api/coa', params: [],
    returns: z.array(T.AccountSchema), process: 'FE.coa.list', screen: '/entry/[id]'
  },
  {
    name: 'payouts.import', noun: 'payouts', verb: 'import', summary: 'Import a Whatnot payout CSV',
    method: 'POST', path: '/api/payouts/import',
    params: [
      { name: 'file', kind: 'positional', type: 'file', in: 'body', required: true, help: 'Path to the payout CSV' },
      { name: 'channel', kind: 'flag', type: 'string', in: 'body', help: 'Sales channel (default whatnot)' }
    ],
    returns: T.PayoutImportSchema, process: 'MW.payouts.import', screen: '/settings', feedback: 'Spinner'
  },
  {
    name: 'evals.run', noun: 'evals', verb: 'run', summary: 'Run the eval cases (exit 1 if any fail)',
    method: 'POST', path: '/api/evals/run', params: [],
    returns: T.EvalRunSchema, process: 'IN.evals.run', shortcut: 'v', screen: '/evals', feedback: 'Progress bar'
  },
  {
    name: 'evals.show', noun: 'evals', verb: 'show', summary: 'Show the last eval run, shadow precision and cost by week',
    method: 'GET', path: '/api/evals', params: [],
    returns: T.EvalSummarySchema, process: 'FE.evals.show', screen: '/evals'
  },
  {
    name: 'eval.add', noun: 'eval', verb: 'add', summary: 'Turn a decided entry into a golden eval case',
    method: 'POST', path: '/api/evals/cases',
    params: [{ name: 'entry', kind: 'positional', type: 'string', in: 'body', required: true, help: 'Entry id with a decision' }],
    returns: z.object({ id: z.string(), kind: z.string(), name: z.string() }), process: 'FE.eval.add', screen: '/entry/[id]', feedback: 'Toast'
  },
  {
    name: 'settings.show', noun: 'settings', verb: 'show', summary: 'Show connections and configuration',
    method: 'GET', path: '/api/settings', params: [],
    returns: T.SettingsSchema, process: 'FE.settings.show', screen: '/settings'
  }
];

export const commandByName = new Map(commands.map((c) => [c.name, c]));

export function buildPath(cmd: Command, values: Record<string, unknown>): string {
  let path = cmd.path.replace(/:(\w+)/g, (_, k) => encodeURIComponent(String(values[k] ?? '')));
  const q = cmd.params.filter((p) => p.in === 'query' && values[camel(p.name)] !== undefined);
  if (q.length) path += '?' + q.map((p) => `${p.name}=${encodeURIComponent(String(values[camel(p.name)]))}`).join('&');
  return path;
}

export const camel = (s: string) => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
