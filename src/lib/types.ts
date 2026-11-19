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
  slashStatus: z.string(),
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

export const AccountSchema = z.object({ id: z.string(), name: z.string(), enabled: z.boolean() });
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
