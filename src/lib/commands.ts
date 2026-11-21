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
  /** Least role allowed: viewer (reads), reviewer (decide on entries), owner (ledgers, switches, members). Enforced in handle(). */
  /** Minimum role in the current company; 'user' = any signed-in user, even one with no company yet. */
  role: 'user' | 'viewer' | 'reviewer' | 'owner';
  /** Writes to Slash: CLI requires --yes and supports --dry-run. */
  writesSlash?: boolean;
  shortcut?: string;
  screen?: string; // UI route where the action lives
  feedback?: string;
  confirm?: string;
  /** Constant body fields this command always sends (e.g. enable/disable share one route). */
  body?: Record<string, unknown>;
}

const id = (help = 'Entry id (ae_…)'): Param => ({ name: 'id', kind: 'positional', type: 'string', in: 'path', required: true, help });
const yes: Param = { name: 'yes', kind: 'flag', type: 'boolean', in: 'body', help: 'Confirm a write to Slash' };
const confirmYes: Param = { name: 'yes', kind: 'flag', type: 'boolean', in: 'body', required: true, help: 'Confirm (required)' };
const roleFlag: Param = { name: 'role', kind: 'flag', type: 'string', in: 'body', required: true, help: 'owner | reviewer | viewer' };
const dryRun: Param = { name: 'dry-run', kind: 'flag', type: 'boolean', in: 'body', help: 'Show what would be written; write nothing' };

export const commands: Command[] = [
  {
    name: 'entries.pull', role: 'reviewer', noun: 'entries', verb: 'pull', summary: 'Pull entries in review from Slash, then research and recommend',
    method: 'POST', path: '/api/entries/pull',
    params: [
      { name: 'since', kind: 'flag', type: 'string', in: 'body', help: 'Only entries created on/after this date (YYYY-MM-DD)' },
      { name: 'connection', kind: 'flag', type: 'string', in: 'body', help: 'Pull one ledger connection only (e.g. conn_mercury)' },
      dryRun
    ],
    returns: T.PullResultSchema, process: 'MW.ledger.pull', shortcut: 'p', screen: '/queue', feedback: 'Spinner on button'
  },
  {
    name: 'entries.list', role: 'viewer', noun: 'entries', verb: 'list', summary: 'List local entries',
    method: 'GET', path: '/api/entries',
    params: [
      { name: 'state', kind: 'flag', type: 'string', in: 'query', help: 'Filter by local state (e.g. recommended, asked, invalid)' },
      { name: 'connection', kind: 'flag', type: 'string', in: 'query', help: 'Filter by ledger connection id' }
    ],
    returns: z.array(T.EntrySchema), process: 'FE.entries.list', screen: '/queue'
  },
  {
    name: 'entry.show', role: 'viewer', noun: 'entry', verb: 'show', summary: 'Show one entry with evidence and decisions',
    method: 'GET', path: '/api/entries/:id', params: [id()],
    returns: T.EntryDetailSchema, process: 'FE.entries.list', screen: '/entry/[id]'
  },
  {
    name: 'entry.recommend', role: 'reviewer', noun: 'entry', verb: 'recommend', summary: 'Research and recommend one entry',
    method: 'POST', path: '/api/entries/:id/recommend',
    params: [id(), { name: 'force', kind: 'flag', type: 'boolean', in: 'body', help: 'Ignore the exact-input cache' }],
    returns: T.RecommendationSchema, process: 'AI.entry.recommend', shortcut: 'R', screen: '/entry/[id]', feedback: 'Spinner'
  },
  {
    name: 'entry.approve', role: 'reviewer', noun: 'entry', verb: 'approve', summary: 'Approve: code the entry in Slash and mark it ready to sync',
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
    name: 'entry.undo', role: 'reviewer', noun: 'entry', verb: 'undo', summary: 'Undo an approval still inside its undo window',
    method: 'POST', path: '/api/entries/:id/undo', params: [id()],
    returns: T.DecisionSchema, process: 'FE.entry.undo', shortcut: 'u', screen: '/queue', feedback: 'Row returns'
  },
  {
    name: 'entry.ask', role: 'reviewer', noun: 'entry', verb: 'ask', summary: 'Open a question for the owner',
    method: 'POST', path: '/api/entries/:id/ask',
    params: [id(), { name: 'text', kind: 'flag', type: 'string', in: 'body', help: 'Question text (defaults to the recommendation\'s question)' }],
    returns: T.QuestionSchema, process: 'FE.entry.ask', shortcut: 'q', screen: '/entry/[id]', feedback: 'Toast'
  },
  {
    name: 'entry.reject', role: 'reviewer', noun: 'entry', verb: 'reject', summary: 'Reject the recommendation; the entry is coded by hand in Slash',
    method: 'POST', path: '/api/entries/:id/reject',
    params: [id(), yes, { name: 'reason', kind: 'flag', type: 'string', in: 'body', help: 'Why' }],
    returns: T.DecisionSchema, process: 'FE.entry.reject', shortcut: 'x', screen: '/entry/[id]', feedback: 'Toast', confirm: 'Requires --yes'
  },
  {
    name: 'questions.list', role: 'viewer', noun: 'questions', verb: 'list', summary: 'List questions for the owner',
    method: 'GET', path: '/api/questions',
    params: [{ name: 'status', kind: 'flag', type: 'string', in: 'query', help: 'open | answered' }],
    returns: z.array(T.QuestionSchema), process: 'FE.questions.list', screen: '/questions'
  },
  {
    name: 'question.answer', role: 'reviewer', noun: 'question', verb: 'answer', summary: 'Answer a question; the entry is re-recommended with the answer',
    method: 'POST', path: '/api/questions/:id/answer',
    params: [id('Question id (q_…)'), { name: 'text', kind: 'flag', type: 'string', in: 'body', required: true, help: 'The answer' }],
    returns: T.QuestionSchema, process: 'FE.question.answer', shortcut: 'Enter', screen: '/questions', feedback: 'Row moves to answered'
  },
  {
    name: 'mappings.list', role: 'viewer', noun: 'mappings', verb: 'list', summary: 'List learned rules',
    method: 'GET', path: '/api/mappings',
    params: [{ name: 'status', kind: 'flag', type: 'string', in: 'query', help: 'proposed | applied | dismissed' }],
    returns: z.array(T.MappingProposalSchema), process: 'FE.mappings.list', screen: '/mappings'
  },
  {
    name: 'mapping.apply', role: 'owner', noun: 'mapping', verb: 'apply', summary: 'Write a learned rule to Slash (recodes entries still in review)',
    method: 'POST', path: '/api/mappings/:id/apply',
    params: [id('Mapping proposal id (mp_…)'), yes, dryRun],
    returns: T.MappingProposalSchema, process: 'FE.mapping.apply', writesSlash: true, shortcut: 'r', screen: '/mappings',
    feedback: 'Spinner', confirm: 'Confirm dialog'
  },
  {
    name: 'coa.pull', role: 'owner', noun: 'coa', verb: 'pull', summary: 'Pull the chart of accounts (Slash account dimension)',
    method: 'POST', path: '/api/coa/pull', params: [dryRun],
    returns: T.CoaPullSchema, process: 'MW.coa.pull', screen: '/settings', feedback: 'Spinner'
  },
  {
    name: 'coa.list', role: 'viewer', noun: 'coa', verb: 'list', summary: 'List accounts from the local chart of accounts',
    method: 'GET', path: '/api/coa', params: [],
    returns: z.array(T.AccountSchema), process: 'FE.coa.list', screen: '/entry/[id]'
  },
  {
    name: 'payouts.import', role: 'reviewer', noun: 'payouts', verb: 'import', summary: 'Import a Whatnot payout CSV',
    method: 'POST', path: '/api/payouts/import',
    params: [
      { name: 'file', kind: 'positional', type: 'file', in: 'body', required: true, help: 'Path to the payout CSV' },
      { name: 'channel', kind: 'flag', type: 'string', in: 'body', help: 'Sales channel (default whatnot)' }
    ],
    returns: T.PayoutImportSchema, process: 'MW.payouts.import', screen: '/settings', feedback: 'Spinner'
  },
  {
    name: 'evals.run', role: 'reviewer', noun: 'evals', verb: 'run', summary: 'Run the eval cases (exit 1 if any fail)',
    method: 'POST', path: '/api/evals/run', params: [],
    returns: T.EvalRunSchema, process: 'IN.evals.run', shortcut: 'v', screen: '/evals', feedback: 'Progress bar'
  },
  {
    name: 'evals.show', role: 'viewer', noun: 'evals', verb: 'show', summary: 'Show the last eval run, shadow precision and cost by week',
    method: 'GET', path: '/api/evals', params: [],
    returns: T.EvalSummarySchema, process: 'FE.evals.show', screen: '/evals'
  },
  {
    name: 'eval.add', role: 'reviewer', noun: 'eval', verb: 'add', summary: 'Turn a decided entry into a golden eval case',
    method: 'POST', path: '/api/evals/cases',
    params: [{ name: 'entry', kind: 'positional', type: 'string', in: 'body', required: true, help: 'Entry id with a decision' }],
    returns: z.object({ id: z.string(), kind: z.string(), name: z.string() }), process: 'FE.eval.add', screen: '/entry/[id]', feedback: 'Toast'
  },
  {
    name: 'ledgers.list', role: 'viewer', noun: 'ledgers', verb: 'list', summary: 'List ledger connections (Slash, Mercury, …) with capabilities and status',
    method: 'GET', path: '/api/ledgers', params: [],
    returns: z.array(T.LedgerConnectionSchema), process: 'FE.ledgers.list', screen: '/ledgers'
  },
  {
    name: 'ledger.show', role: 'viewer', noun: 'ledger', verb: 'show', summary: 'Show one connection: capabilities, blockers, ledger and QuickBooks bank accounts',
    method: 'GET', path: '/api/ledgers/:id', params: [id('Connection id (conn_…)')],
    returns: T.LedgerDetailSchema, process: 'FE.ledgers.list', screen: '/ledgers'
  },
  {
    name: 'ledger.add', role: 'owner', noun: 'ledger', verb: 'add', summary: 'Add a ledger connection (starts inactive)',
    method: 'POST', path: '/api/ledgers',
    params: [
      { name: 'kind', kind: 'flag', type: 'string', in: 'body', required: true, help: 'slash | mercury' },
      { name: 'name', kind: 'flag', type: 'string', in: 'body', required: true, help: 'Display name, e.g. "Mercury Operating"' },
      { name: 'mode', kind: 'flag', type: 'string', in: 'body', help: 'fixture (default) | live' },
      { name: 'token-stdin', kind: 'flag', type: 'boolean', in: 'body', help: 'Read the ledger API token from stdin (never pass it as an argument)' },
      { name: 'qbo-bank', kind: 'flag', type: 'string', in: 'body', help: 'Ledger account → QuickBooks bank account, e.g. acc_chk=10' },
      { name: 'legal-entity', kind: 'flag', type: 'string', in: 'body', help: 'Slash only: legal entity id for multi-entity accounts' },
      { name: 'confirm-bank-feed', kind: 'flag', type: 'boolean', in: 'body', help: "Confirm the ledger's own QuickBooks sync and the QBO bank feed are off or will be matched" }
    ],
    returns: T.LedgerConnectionSchema, process: 'FE.ledger.add', screen: '/ledgers', feedback: 'Panel closes, row appears', confirm: 'Bank-feed checkbox required for QuickBooks-direct ledgers'
  },
  {
    name: 'ledger.configure', role: 'owner', noun: 'ledger', verb: 'configure', summary: 'Update bank-account mapping or bank-feed confirmation',
    method: 'POST', path: '/api/ledgers/:id/config',
    params: [
      id('Connection id'),
      { name: 'qbo-bank', kind: 'flag', type: 'string', in: 'body', help: 'Ledger account → QuickBooks bank account, e.g. acc_chk=10' },
      { name: 'confirm-bank-feed', kind: 'flag', type: 'boolean', in: 'body', help: 'Confirm the bank-feed setting (recorded with who and when)' },
      { name: 'mode', kind: 'flag', type: 'string', in: 'body', help: 'fixture | live (live needs a key)' },
      { name: 'token-stdin', kind: 'flag', type: 'boolean', in: 'body', help: 'Replace the stored API key/token, read from stdin; it is checked against the ledger before saving' },
      { name: 'legal-entity', kind: 'flag', type: 'string', in: 'body', help: 'Slash only: legal entity id for multi-entity accounts' }
    ],
    returns: T.LedgerConnectionSchema, process: 'FE.ledger.add', screen: '/ledgers', feedback: 'Saved toast; a rejected key is not saved'
  },
  {
    name: 'ledger.test', role: 'owner', noun: 'ledger', verb: 'test', summary: 'Test a connection with its stored credentials',
    method: 'POST', path: '/api/ledgers/:id/test', params: [id('Connection id')],
    returns: T.LedgerDetailSchema, process: 'MW.ledger.test', screen: '/ledgers', feedback: 'Spinner, then ok/failed badge'
  },
  {
    name: 'ledger.enable', role: 'owner', noun: 'ledger', verb: 'enable', summary: 'Activate a connection (pulled hourly, approvals allowed)',
    method: 'POST', path: '/api/ledgers/:id/state', params: [id('Connection id')], body: { active: true },
    returns: T.LedgerConnectionSchema, process: 'FE.ledger.toggle', screen: '/ledgers', feedback: 'Status flips', confirm: 'Refused with the blockers listed'
  },
  {
    name: 'ledger.disable', role: 'owner', noun: 'ledger', verb: 'disable', summary: 'Deactivate a connection (not pulled, no approvals; items stay visible)',
    method: 'POST', path: '/api/ledgers/:id/state', params: [id('Connection id')], body: { active: false },
    returns: T.LedgerConnectionSchema, process: 'FE.ledger.toggle', screen: '/ledgers', feedback: 'Status flips'
  },
  {
    name: 'system.graph', role: 'viewer', noun: 'system', verb: 'graph', summary: 'Show the component graph: agents, processes, tools, tables, external systems',
    method: 'GET', path: '/api/system/graph', params: [],
    returns: T.SystemGraphSchema, process: 'FE.system.graph', screen: '/system'
  },
  {
    name: 'components.list', role: 'viewer', noun: 'components', verb: 'list', summary: 'List agents, processes and tools with on/off state and 7-day metrics',
    method: 'GET', path: '/api/system/components',
    params: [{ name: 'kind', kind: 'flag', type: 'string', in: 'query', help: 'agent | rule | human | tool' }],
    returns: z.array(T.ComponentSchema), process: 'FE.system.graph', screen: '/system/agents'
  },
  {
    name: 'component.show', role: 'viewer', noun: 'component', verb: 'show', summary: 'Show one component: card, live state graph, recent runs',
    method: 'GET', path: '/api/system/components/:id', params: [id('Component id (e.g. AI.entry.recommend, slash.write)')],
    returns: T.ComponentDetailSchema, process: 'FE.system.graph', screen: '/system/processes/[id]'
  },
  {
    name: 'component.enable', role: 'owner', noun: 'component', verb: 'enable', summary: 'Switch a component on',
    method: 'POST', path: '/api/system/components/:id/state', params: [id('Component id')], body: { enabled: true },
    returns: T.ComponentSchema, process: 'FE.component.toggle', shortcut: 't', screen: '/system/agents', feedback: 'Switch flips, node recolors', confirm: '—'
  },
  {
    name: 'component.disable', role: 'owner', noun: 'component', verb: 'disable', summary: 'Switch a component off (its whenOff behavior applies)',
    method: 'POST', path: '/api/system/components/:id/state', params: [id('Component id')], body: { enabled: false },
    returns: T.ComponentSchema, process: 'FE.component.toggle', shortcut: 't', screen: '/system/agents', feedback: 'Switch flips, node recolors', confirm: 'Confirm dialog naming the whenOff behavior'
  },
  {
    name: 'settings.show', role: 'viewer', noun: 'settings', verb: 'show', summary: 'Show connections and configuration',
    method: 'GET', path: '/api/settings', params: [],
    returns: T.SettingsSchema, process: 'FE.settings.show', screen: '/settings'
  },
  // ---- Members, tokens, companies (M8) ----
  {
    name: 'auth.whoami', role: 'viewer', noun: 'auth', verb: 'whoami', summary: 'Who am I: email, company and role',
    method: 'GET', path: '/api/auth/whoami', params: [],
    returns: T.WhoamiSchema, process: 'FE.auth.whoami', screen: '/settings/members'
  },
  {
    name: 'members.list', role: 'owner', noun: 'members', verb: 'list', summary: 'List members and pending invites of this company',
    method: 'GET', path: '/api/members', params: [],
    returns: z.array(T.MemberSchema), process: 'FE.members.list', screen: '/settings/members'
  },
  {
    name: 'member.invite', role: 'owner', noun: 'member', verb: 'invite', summary: 'Invite a Google email with a role (accepted on first sign-in)',
    method: 'POST', path: '/api/members/invite',
    params: [{ name: 'email', kind: 'flag', type: 'string', in: 'body', required: true, help: 'Google account email' }, roleFlag],
    returns: T.MemberSchema, process: 'FE.member.invite', screen: '/settings/members', feedback: 'Row appears as pending'
  },
  {
    name: 'member.role', role: 'owner', noun: 'member', verb: 'role', summary: "Change a member's role (the last owner can't be demoted)",
    method: 'POST', path: '/api/members/:id/role', params: [id('Member id (mem_…)'), roleFlag],
    returns: T.MemberSchema, process: 'FE.member.role', screen: '/settings/members', feedback: 'Select updates'
  },
  {
    name: 'member.remove', role: 'owner', noun: 'member', verb: 'remove', summary: "Remove a member or cancel an invite (the last owner can't be removed)",
    method: 'POST', path: '/api/members/:id/remove', params: [id('Member id (mem_…) or invite id (inv_…)'), confirmYes],
    returns: T.MemberSchema, process: 'FE.member.remove', screen: '/settings/members', feedback: 'Row disappears', confirm: 'Requires --yes'
  },
  {
    name: 'tokens.list', role: 'owner', noun: 'tokens', verb: 'list', summary: 'List API tokens of this company',
    method: 'GET', path: '/api/tokens', params: [],
    returns: z.array(T.ApiTokenSchema), process: 'FE.tokens.list', screen: '/settings/members'
  },
  {
    name: 'token.create', role: 'owner', noun: 'token', verb: 'create', summary: 'Create an API token for the CLI (shown once)',
    method: 'POST', path: '/api/tokens', params: [{ name: 'name', kind: 'flag', type: 'string', in: 'body', required: true, help: 'Label, e.g. "laptop CLI"' }],
    returns: T.NewTokenSchema, process: 'FE.token.create', screen: '/settings/members', feedback: 'Token shown once with Copy'
  },
  {
    name: 'token.revoke', role: 'owner', noun: 'token', verb: 'revoke', summary: 'Revoke an API token (next request with it gets 401)',
    method: 'POST', path: '/api/tokens/:id/revoke', params: [id('Token id (tok_…)'), confirmYes],
    returns: T.ApiTokenSchema, process: 'FE.token.revoke', screen: '/settings/members', feedback: 'Row greys out', confirm: 'Requires --yes'
  },
  {
    name: 'company.create', role: 'user', noun: 'company', verb: 'create', summary: 'Create a company; you become its owner (self-serve sign-up)',
    method: 'POST', path: '/api/orgs',
    params: [
      { name: 'name', kind: 'flag', type: 'string', in: 'body', required: true, help: 'Company name' },
      { name: 'business', kind: 'flag', type: 'string', in: 'body', required: true, help: 'One or two sentences: what it sells and how it gets paid' }
    ],
    returns: T.CompanySchema, process: 'FE.company.create', screen: '/welcome', feedback: 'Button spinner, then the setup checklist'
  },
  {
    name: 'company.show', role: 'viewer', noun: 'company', verb: 'show', summary: 'Show the company profile and setup checklist',
    method: 'GET', path: '/api/company', params: [],
    returns: T.CompanySchema, process: 'FE.company.update', screen: '/settings'
  },
  {
    name: 'company.update', role: 'owner', noun: 'company', verb: 'update', summary: 'Update the company name, description and coding rules (used by the agent)',
    method: 'POST', path: '/api/company',
    params: [
      { name: 'name', kind: 'flag', type: 'string', in: 'body', help: 'Company name' },
      { name: 'business', kind: 'flag', type: 'string', in: 'body', help: 'What the company does' },
      { name: 'coding-rules', kind: 'flag', type: 'string', in: 'body', help: 'House coding rules, one per line' }
    ],
    returns: T.CompanySchema, process: 'FE.company.update', screen: '/settings', feedback: 'Saved toast'
  },
  {
    name: 'orgs.list', role: 'viewer', noun: 'orgs', verb: 'list', summary: 'List the companies you belong to',
    method: 'GET', path: '/api/orgs', params: [],
    returns: z.array(T.OrgSchema), process: 'FE.orgs.list', screen: '/queue'
  },
  {
    name: 'org.select', role: 'viewer', noun: 'org', verb: 'select', summary: 'Switch the current company (web session)',
    method: 'POST', path: '/api/orgs/:id/select', params: [id('Company id (org_…)')],
    returns: T.OrgSchema, process: 'FE.org.select', screen: '/queue', feedback: 'Page reloads in that company'
  }
];

export const commandByName = new Map(commands.map((c) => [c.name, c]));

/** SvelteKit route id (/api/ledgers/[id]/state) + method → the registry entry (first match). */
const byRoute = new Map<string, Command>();
for (const c of commands) {
  const k = `${c.method} ${c.path.replace(/:(\w+)/g, '[$1]')}`;
  if (!byRoute.has(k)) byRoute.set(k, c);
}
export const commandForRoute = (method: string, routeId: string | null) => (routeId ? byRoute.get(`${method} ${routeId}`) : undefined);

export function buildPath(cmd: Command, values: Record<string, unknown>): string {
  let path = cmd.path.replace(/:(\w+)/g, (_, k) => encodeURIComponent(String(values[k] ?? '')));
  const q = cmd.params.filter((p) => p.in === 'query' && values[camel(p.name)] !== undefined);
  if (q.length) path += '?' + q.map((p) => `${p.name}=${encodeURIComponent(String(values[camel(p.name)]))}`).join('&');
  return path;
}

export const camel = (s: string) => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
