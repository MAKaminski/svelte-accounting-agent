// Plain-language names for processes, tools and lanes. The technical id (AI.entry.recommend) stays the key
// everywhere — registry, URLs, audit log — and is shown beside the name on detail views.
const NAMES: Record<string, string> = {
  'MW.coa.pull': 'Pull chart of accounts', 'MW.ledger.pull': 'Pull transactions', 'MW.entry.research': 'Research history',
  'AI.merchant.identify': 'Identify merchant', 'AI.entry.recommend': 'Recommend coding', 'MW.entry.validate': 'Validate coding',
  'FE.entry.approve': 'Approve', 'FE.entry.undo': 'Undo', 'MW.ledger.code': 'Write coding to ledger', 'MW.ledger.ready': 'Mark ready',
  'FE.entry.ask': 'Ask the owner', 'FE.entry.reject': 'Reject', 'FE.question.answer': 'Answer a question',
  'MW.mapping.propose': 'Propose a rule', 'FE.mapping.apply': 'Apply a rule', 'MW.payouts.import': 'Import payout report',
  'IN.evals.run': 'Run evals', 'FE.eval.add': 'Add eval case', 'MW.qbo.connect': 'Connect QuickBooks',
  'FE.entries.list': 'View queue', 'FE.questions.list': 'View questions', 'FE.mappings.list': 'View rules', 'FE.evals.show': 'View evals',
  'FE.settings.show': 'View settings', 'FE.coa.list': 'View accounts', 'FE.system.graph': 'View system map',
  'FE.component.toggle': 'Switch a component', 'MW.qbo.write': 'Write to QuickBooks', 'MW.ledger.annotate': 'Add ledger note',
  'MW.qbo.accounts': 'Pull QuickBooks accounts', 'MW.ledger.test': 'Test a connection', 'FE.ledger.add': 'Add a ledger',
  'FE.ledger.toggle': 'Activate a ledger', 'FE.ledgers.list': 'View ledgers', 'MW.org.create': 'Create a company',
  'MW.audit.record': 'Audit log', 'MW.auth.signin': 'Sign-in check', 'FE.auth.whoami': 'Who am I', 'FE.members.list': 'View members',
  'FE.member.invite': 'Invite a member', 'FE.member.role': 'Change a role', 'FE.member.remove': 'Remove a member',
  'FE.tokens.list': 'View API tokens', 'FE.token.create': 'Create API token', 'FE.token.revoke': 'Revoke API token',
  'FE.orgs.list': 'View companies', 'FE.org.select': 'Switch company',
  'slash.read': 'Slash: read', 'slash.write': 'Slash: write', 'slash.mappings': 'Slash: rules', 'qbo.read': 'QuickBooks: read',
  'qbo.write': 'QuickBooks: write', 'model.anthropic': 'Claude', 'model.ollama': 'Local model (Ollama)',
  'mercury.read': 'Mercury: read', 'mercury.annotate': 'Mercury: note'
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Recommend coding" for AI.entry.recommend; unknown ids fall back to "Verb noun". */
export function friendly(id: string): string {
  if (NAMES[id]) return NAMES[id];
  const m = /^(?:FE|MW|AI|IN|BE)\.([a-z]+)\.([a-z]+)$/.exec(id);
  return m ? `${cap(m[2])} ${m[1]}` : id.replace(/^table:|^ext:/, '');
}

export const LANE_NAMES: Record<string, string> = {
  FE: 'You do', MW: 'Rules (no model)', AI: 'Agents (model)', IN: 'Checks', BE: 'Data', TOOLS: 'Tools', EXT: 'Outside'
};
