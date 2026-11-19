import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// All money in integer cents. All times UTC ISO-8601 strings.

export const LOCAL_STATES = [
  'fetched', 'researched', 'recommended', 'invalid', 'asked',
  'approved', 'coded', 'ready', 'synced', 'rejected'
] as const;
export type LocalState = (typeof LOCAL_STATES)[number];

export const accountingEntries = sqliteTable('accounting_entries', {
  id: text('id').primaryKey(), // Slash entry id (ae_…)
  slashStatus: text('slash_status').notNull(),
  localState: text('local_state').$type<LocalState>().notNull().default('fetched'),
  amountCents: integer('amount_cents').notNull(),
  memo: text('memo'),
  stateReason: text('state_reason'),
  pendingUntil: text('pending_until'), // deferred-commit deadline after approve (undo window)
  rawJson: text('raw_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}, (t) => [index('entries_state_idx').on(t.localState, t.createdAt)]);

export const slashTransactions = sqliteTable('slash_transactions', {
  id: text('id').primaryKey(),
  accountingEntryId: text('accounting_entry_id').notNull().references(() => accountingEntries.id),
  date: text('date').notNull(),
  description: text('description').notNull(),
  merchantId: text('merchant_id'),
  merchantName: text('merchant_name'),
  mcc: text('mcc'),
  categoryId: text('category_id'),
  amountCents: integer('amount_cents').notNull(),
  rawJson: text('raw_json').notNull()
}, (t) => [index('tx_entry_idx').on(t.accountingEntryId), index('tx_merchant_idx').on(t.merchantId)]);

export const dimensionValues = sqliteTable('dimension_values', {
  id: text('id').primaryKey(), // Slash dimension value id (valueId)
  dimension: text('dimension').notNull(), // 'account'
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  updatedAt: text('updated_at').notNull()
});

export const EVIDENCE_KINDS = ['slash_history', 'qbo_history', 'mcc', 'payout_row', 'owner_answer', 'merchant_profile'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const evidence = sqliteTable('evidence', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull().references(() => accountingEntries.id),
  kind: text('kind').$type<EvidenceKind>().notNull(),
  reference: text('reference'),
  payoutRowId: text('payout_row_id').references(() => payoutRows.id),
  summary: text('summary').notNull(),
  createdAt: text('created_at').notNull()
}, (t) => [index('evidence_entry_idx').on(t.entryId)]);

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  processId: text('process_id').notNull(),
  evalCaseId: text('eval_case_id').references(() => evalCases.id),
  subjectId: text('subject_id'),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  status: text('status').$type<'running' | 'ok' | 'failed'>().notNull(),
  error: text('error'),
  detailJson: text('detail_json')
}, (t) => [index('runs_process_idx').on(t.processId, t.startedAt)]);

export const recommendations = sqliteTable('recommendations', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull().references(() => accountingEntries.id),
  runId: text('run_id').references(() => runs.id),
  primaryValueId: text('primary_value_id').references(() => dimensionValues.id),
  action: text('action').$type<'code' | 'ask'>().notNull(),
  linesJson: text('lines_json').notNull(),
  memo: text('memo').notNull(),
  confidence: real('confidence').notNull(),
  reasoning: text('reasoning').notNull(),
  question: text('question'),
  promptVersion: text('prompt_version').notNull(),
  model: text('model').notNull(),
  inputHash: text('input_hash').notNull(),
  tokensFresh: integer('tokens_fresh').notNull().default(0),
  tokensCacheWrite: integer('tokens_cache_write').notNull().default(0),
  tokensCacheRead: integer('tokens_cache_read').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  ttftMs: integer('ttft_ms'),
  e2eMs: integer('e2e_ms'),
  shadowAutoApprove: integer('shadow_auto_approve', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull()
}, (t) => [index('rec_entry_idx').on(t.entryId), index('rec_hash_idx').on(t.inputHash)]);

export const decisions = sqliteTable('decisions', {
  id: text('id').primaryKey(),
  recommendationId: text('recommendation_id').notNull().references(() => recommendations.id),
  action: text('action').$type<'approved' | 'edited' | 'asked' | 'rejected' | 'undone'>().notNull(),
  finalLinesJson: text('final_lines_json'),
  finalMemo: text('final_memo'),
  decidedBy: text('decided_by').notNull(),
  decidedAt: text('decided_at').notNull()
}, (t) => [index('decision_rec_idx').on(t.recommendationId, t.decidedAt)]);

export const questions = sqliteTable('questions', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull().references(() => accountingEntries.id),
  text: text('text').notNull(),
  bestGuess: text('best_guess'),
  answer: text('answer'),
  status: text('status').$type<'open' | 'answered'>().notNull(),
  createdAt: text('created_at').notNull(),
  answeredAt: text('answered_at')
});

export const mappingProposals = sqliteTable('mapping_proposals', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').$type<'merchant' | 'merchant_category'>().notNull(),
  sourceId: text('source_id').notNull(),
  sourceLabel: text('source_label').notNull(),
  dimension: text('dimension').notNull(),
  valueId: text('value_id').notNull().references(() => dimensionValues.id),
  supportCount: integer('support_count').notNull(),
  status: text('status').$type<'proposed' | 'applied' | 'dismissed'>().notNull(),
  createdAt: text('created_at').notNull(),
  appliedAt: text('applied_at')
}, (t) => [uniqueIndex('mapping_source_idx').on(t.sourceType, t.sourceId, t.dimension)]);

export const payoutRows = sqliteTable('payout_rows', {
  id: text('id').primaryKey(), // `${channel}:${payoutId}`
  channel: text('channel').notNull(),
  payoutId: text('payout_id').notNull(),
  date: text('date').notNull(),
  grossCents: integer('gross_cents').notNull(),
  feesCents: integer('fees_cents').notNull(),
  shippingCents: integer('shipping_cents').notNull(),
  netCents: integer('net_cents').notNull()
});

export const evalCases = sqliteTable('eval_cases', {
  id: text('id').primaryKey(),
  kind: text('kind').$type<'golden' | 'edge' | 'refuse'>().notNull(),
  name: text('name').notNull(),
  inputJson: text('input_json').notNull(),
  expectedJson: text('expected_json').notNull()
});

export const qboTokens = sqliteTable('qbo_tokens', {
  realmId: text('realm_id').primaryKey(),
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  expiresAt: text('expires_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

/** Per-component on/off (processes and tools from processes.yaml). Absent row = enabled. */
export const componentStates = sqliteTable('component_states', {
  componentId: text('component_id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  configJson: text('config_json'),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull()
});
