// Shared return schemas: the CLI --json output, the API response and the UI all use these.
import { z } from 'zod';

export const LocalStateSchema = z.enum([
  'fetched', 'researched', 'recommended', 'invalid', 'asked',
  'approved', 'coded', 'ready', 'synced', 'rejected'
]);

export const LineSchema = z.object({
  valueId: z.string().min(1),
  amountCents: z.number().int(),
  description: z.string().max(200).optional()
});
export type Line = z.infer<typeof LineSchema>;

export const LineViewSchema = LineSchema.extend({ accountName: z.string() });

export const EvidenceSchema = z.object({
  id: z.string(),
  kind: z.string(),
  reference: z.string().nullable(),
  summary: z.string()
});

export const RecommendationSchema = z.object({
  id: z.string(),
  entryId: z.string(),
  action: z.enum(['code', 'ask']),
  lines: z.array(LineViewSchema),
  memo: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
  question: z.string().nullable(),
  model: z.string(),
  promptVersion: z.string(),
  costUsd: z.number(),
  tokens: z.object({ fresh: z.number(), cacheWrite: z.number(), cacheRead: z.number(), out: z.number() }),
  ttftMs: z.number().nullable(),
  e2eMs: z.number().nullable(),
  shadowAutoApprove: z.boolean(),
  createdAt: z.string()
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const EntrySchema = z.object({
  id: z.string(),
  ledgerStatus: z.string(),
  state: LocalStateSchema,
  stateReason: z.string().nullable(),
  amountCents: z.number().int(),
  memo: z.string().nullable(),
  date: z.string().nullable(),
  description: z.string().nullable(),
  merchantId: z.string().nullable(),
  merchantName: z.string().nullable(),
  mcc: z.string().nullable(),
  pendingUntil: z.string().nullable(),
  connectionId: z.string(),
  ledgerName: z.string(),
  ledgerKind: z.string(),
  chart: z.enum(['slash', 'qbo']),
  writesTo: z.string(),
  qboTxnId: z.string().nullable(),
  openQuestionId: z.string().nullable(),
  recommendation: RecommendationSchema.nullable()
});
export type Entry = z.infer<typeof EntrySchema>;

export const EntryDetailSchema = EntrySchema.extend({
  evidence: z.array(EvidenceSchema),
  decisions: z.array(z.object({ id: z.string(), action: z.string(), decidedBy: z.string(), decidedAt: z.string() }))
});
export type EntryDetail = z.infer<typeof EntryDetailSchema>;

export const PullResultSchema = z.object({
  pulled: z.number(),
  newMerchants: z.number(),
  dryRun: z.boolean(),
  entries: z.array(EntrySchema)
});

export const DecisionSchema = z.object({
  id: z.string(),
  entryId: z.string(),
  action: z.enum(['approved', 'edited', 'asked', 'rejected', 'undone']),
  lines: z.array(LineViewSchema).nullable(),
  decidedBy: z.string(),
  decidedAt: z.string(),
  state: LocalStateSchema,
  pendingUntil: z.string().nullable(),
  dryRun: z.boolean()
});
export type Decision = z.infer<typeof DecisionSchema>;

export const QuestionSchema = z.object({
  id: z.string(),
  entryId: z.string(),
  text: z.string(),
  bestGuess: z.string().nullable(),
  answer: z.string().nullable(),
  status: z.enum(['open', 'answered']),
  createdAt: z.string(),
  answeredAt: z.string().nullable(),
  merchant: z.string().nullable(),
  amountCents: z.number().nullable()
});
export type Question = z.infer<typeof QuestionSchema>;

export const MappingProposalSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  target: z.enum(['ledger', 'local']),
  sourceType: z.string(),
  sourceId: z.string(),
  sourceLabel: z.string(),
  dimension: z.string(),
  valueId: z.string(),
  accountName: z.string(),
  supportCount: z.number(),
  status: z.enum(['proposed', 'applied', 'dismissed']),
  createdAt: z.string(),
  appliedAt: z.string().nullable(),
  dryRun: z.boolean().optional()
});
export type MappingProposal = z.infer<typeof MappingProposalSchema>;

export const EvalCaseResultSchema = z.object({
  caseId: z.string(),
  name: z.string(),
  kind: z.string(),
  pass: z.boolean(),
  failures: z.array(z.string()),
  costUsd: z.number(),
  e2eMs: z.number()
});

export const EvalRunSchema = z.object({
  runId: z.string(),
  mode: z.string(),
  passed: z.number(),
  total: z.number(),
  costUsd: z.number(),
  cases: z.array(EvalCaseResultSchema)
});
export type EvalRun = z.infer<typeof EvalRunSchema>;

export const EvalSummarySchema = z.object({
  lastRun: EvalRunSchema.nullable(),
  shadow: z.object({
    decisions: z.number(),
    agreed: z.number(),
    precision: z.number().nullable(),
    autoApproveWouldHave: z.number(),
    autoApprovePrecision: z.number().nullable()
  }),
  costByWeek: z.array(z.object({ week: z.string(), calls: z.number(), costUsd: z.number(), cacheReadShare: z.number().nullable() })),
  cases: z.array(z.object({ id: z.string(), kind: z.string(), name: z.string() }))
});

export const PayoutImportSchema = z.object({ imported: z.number(), channel: z.string(), errors: z.array(z.string()) });

export const AccountSchema = z.object({ id: z.string(), name: z.string(), enabled: z.boolean(), source: z.enum(['slash', 'qbo']).optional() });
export const CoaPullSchema = z.object({ accounts: z.array(AccountSchema), dryRun: z.boolean() });

export const SettingsSchema = z.object({
  slashMode: z.string(),
  slashKeyPresent: z.boolean(),
  legalEntityPresent: z.boolean(),
  qboMode: z.string(),
  qboConnected: z.boolean(),
  modelMode: z.string(),
  modelWorker: z.string(),
  modelIntegrator: z.string(),
  ollama: z.boolean(),
  passcodeSet: z.boolean(),
  pullIntervalMin: z.number(),
  undoWindowMs: z.number(),
  accounts: z.number(),
  lastPullAt: z.string().nullable()
});

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), source: z.enum(['app', 'slash', 'qbo', 'model']).optional() })
});

// ---- Control plane ----
export const ComponentSchema = z.object({
  id: z.string(),
  kind: z.enum(['agent', 'rule', 'human', 'tool']),
  layer: z.enum(['FE', 'MW', 'AI', 'IN', 'BE', 'TOOLS']),
  label: z.string(),
  summary: z.string(),
  toggle: z.boolean(),
  whenOff: z.string().nullable(),
  enabled: z.boolean(),
  status: z.enum(['active', 'idle', 'degraded', 'off']),
  tier: z.string().nullable(),
  promptVersion: z.string().nullable(),
  target: z.string().nullable(),
  usedBy: z.array(z.string()),
  writes: z.array(z.string()),
  evalPassRate: z.number().nullable(),
  calls7d: z.number(),
  failures7d: z.number(),
  p95Ms: z.number().nullable(),
  costUsd7d: z.number(),
  cacheReadShare: z.number().nullable(),
  lastRunAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable()
});
export type Component = z.infer<typeof ComponentSchema>;

export const ComponentDetailSchema = ComponentSchema.extend({
  card: z.object({ trigger: z.string(), input: z.string(), steps: z.array(z.object({ kind: z.string(), does: z.string(), tier: z.string().optional(), evals: z.array(z.string()).optional() })), output: z.string(), fails: z.string(), accept: z.string(), budget: z.object({ p95_ms: z.number(), usd: z.number() }) }).nullable(),
  tool: z.object({ port: z.string(), ops: z.array(z.string()) }).nullable(),
  traces: z.array(z.string()),
  stateCounts: z.record(z.string(), z.number()),
  transitions: z.array(z.object({ from: z.string(), to: z.string(), by: z.string(), mine: z.boolean() })),
  runs: z.array(z.object({ id: z.string(), subjectId: z.string().nullable(), startedAt: z.string(), status: z.string(), error: z.string().nullable(), e2eMs: z.number().nullable() }))
});
export type ComponentDetail = z.infer<typeof ComponentDetailSchema>;

export const SystemGraphSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(), label: z.string(),
    kind: z.enum(['agent', 'rule', 'human', 'tool', 'table', 'external']),
    layer: z.enum(['FE', 'MW', 'AI', 'IN', 'BE', 'TOOLS', 'EXT']),
    status: z.enum(['active', 'idle', 'degraded', 'off']),
    toggle: z.boolean()
  })),
  edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string(), kind: z.enum(['flow', 'writes', 'uses', 'calls']) }))
});
export type SystemGraph = z.infer<typeof SystemGraphSchema>;

// ---- Ledgers ----
export const CapabilitiesSchema = z.object({
  reviewUnit: z.enum(['accounting_entry', 'transaction']), chart: z.enum(['ledger', 'qbo']), code: z.enum(['ledger', 'qbo_direct']),
  markReady: z.boolean(), mappings: z.enum(['ledger', 'local']), annotate: z.boolean()
});
export const LedgerConnectionSchema = z.object({
  id: z.string(), kind: z.string(), name: z.string(), mode: z.enum(['fixture', 'live']), status: z.enum(['active', 'inactive']),
  capabilities: CapabilitiesSchema,
  config: z.object({ accountIds: z.array(z.string()).optional(), qboBankAccountIdByAccount: z.record(z.string(), z.string()).optional() }),
  hasCredentials: z.boolean(), bankFeedConfirmedBy: z.string().nullable(), bankFeedConfirmedAt: z.string().nullable(),
  lastPullAt: z.string().nullable(), lastError: z.string().nullable(), blockers: z.array(z.string()),
  inReview: z.number(), total: z.number(), createdAt: z.string()
});
export type LedgerConnection = z.infer<typeof LedgerConnectionSchema>;
export const LedgerDetailSchema = LedgerConnectionSchema.extend({
  health: z.object({ ok: z.boolean(), message: z.string() }).nullable(),
  ledgerAccounts: z.array(z.object({ id: z.string(), name: z.string() })),
  qboBankAccounts: z.array(z.object({ id: z.string(), name: z.string() }))
});
