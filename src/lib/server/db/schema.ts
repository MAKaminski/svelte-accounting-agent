import { pgTable, text, integer, doublePrecision, boolean, index, uniqueIndex, primaryKey, foreignKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// All money in integer cents. All times UTC ISO-8601 strings.
// Multi-tenant: every tenant table has org_id, defaulted from the session's app.org_id and enforced by
// row-level security (drizzle/0001_rls.sql). Externally-derived ids are unique per org: composite keys.

export const LOCAL_STATES = [
  'fetched', 'researched', 'recommended', 'invalid', 'asked',
  'approved', 'coded', 'ready', 'synced', 'rejected'
] as const;
export type LocalState = (typeof LOCAL_STATES)[number];

export type LedgerKind = 'slash' | 'mercury';
export interface Capabilities {
  reviewUnit: 'accounting_entry' | 'transaction';
  chart: 'ledger' | 'qbo';
  code: 'ledger' | 'qbo_direct';
  markReady: boolean;
  mappings: 'ledger' | 'local';
  annotate: boolean;
}
export type Role = 'owner' | 'reviewer' | 'viewer';

// ---------- global (no RLS; reached only through the root connection by auth/scheduler code) ----------

export const orgs = pgTable('orgs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** CompanyProfile JSON: what the business does and its coding preferences (feeds AI.entry.recommend). */
  profileJson: text('profile_json').notNull().default('{}'),
  createdAt: text('created_at').notNull()
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  googleSub: text('google_sub'),
  lastSeenAt: text('last_seen_at'),
  createdAt: text('created_at').notNull()
}, (t) => [uniqueIndex('users_email_idx').on(t.email)]);

/** Tenant column: org_id defaults to the session's org (set per request/job), so inserts can't pick another org. */
const orgId = () => text('org_id').notNull().references(() => orgs.id).default(sql`current_setting('app.org_id', true)`);

export const memberships = pgTable('memberships', {
  id: text('id').primaryKey(),
  orgId: orgId(),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').$type<Role>().notNull(),
  createdAt: text('created_at').notNull()
}, (t) => [uniqueIndex('membership_org_user_idx').on(t.orgId, t.userId)]);

export const invites = pgTable('invites', {
  id: text('id').primaryKey(),
  orgId: orgId(),
  email: text('email').notNull(),
  role: text('role').$type<Role>().notNull(),
  invitedBy: text('invited_by').references(() => users.id),
  createdAt: text('created_at').notNull(),
  acceptedAt: text('accepted_at')
}, (t) => [index('invites_email_idx').on(t.email)]);

export const apiTokens = pgTable('api_tokens', {
  id: text('id').primaryKey(),
  orgId: orgId(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
  createdAt: text('created_at').notNull()
}, (t) => [uniqueIndex('api_token_hash_idx').on(t.tokenHash)]);

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  orgId: orgId(),
  actor: text('actor').notNull(), // user id, 'token:<id>', or 'system'
  action: text('action').notNull(), // e.g. FE.entry.approve, FE.component.toggle, FE.member.invite
  subject: text('subject'),
  detailJson: text('detail_json'),
  at: text('at').notNull()
}, (t) => [index('audit_org_at_idx').on(t.orgId, t.at)]);

// ---------- tenant tables ----------

/** One ledger the company connects (Slash, Mercury, …). Credentials are AES-GCM encrypted. */
export const ledgerConnections = pgTable('ledger_connections', {
  orgId: orgId(),
  id: text('id').notNull(),
  kind: text('kind').$type<LedgerKind>().notNull(),
  name: text('name').notNull(),
  mode: text('mode').$type<'fixture' | 'live'>().notNull(),
  status: text('status').$type<'active' | 'inactive'>().notNull(),
  configJson: text('config_json').notNull().default('{}'),
  credentialsEnc: text('credentials_enc'),
  capabilitiesJson: text('capabilities_json').notNull(),
  bankFeedConfirmedBy: text('bank_feed_confirmed_by'),
  bankFeedConfirmedAt: text('bank_feed_confirmed_at'),
  lastPullAt: text('last_pull_at'),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

export const ledgerItems = pgTable('ledger_items', {
  orgId: orgId(),
  id: text('id').notNull(), // external id: Slash entry id (ae_…) or Mercury txn id (mtx_…)
  connectionId: text('connection_id').notNull(),
  externalId: text('external_id').notNull(),
  qboTxnId: text('qbo_txn_id'),
  qboTxnType: text('qbo_txn_type'),
  ledgerStatus: text('ledger_status').notNull(),
  localState: text('local_state').$type<LocalState>().notNull().default('fetched'),
  amountCents: integer('amount_cents').notNull(),
  memo: text('memo'),
  stateReason: text('state_reason'),
  pendingUntil: text('pending_until'), // deferred-commit deadline after approve (undo window)
  rawJson: text('raw_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}, (t) => [
  primaryKey({ columns: [t.orgId, t.id] }),
  foreignKey({ columns: [t.orgId, t.connectionId], foreignColumns: [ledgerConnections.orgId, ledgerConnections.id] }),
  index('entries_state_idx').on(t.orgId, t.localState, t.createdAt),
  index('entries_conn_idx').on(t.orgId, t.connectionId, t.localState),
  uniqueIndex('entries_ext_idx').on(t.orgId, t.connectionId, t.externalId)
]);

export const ledgerTransactions = pgTable('ledger_transactions', {
  orgId: orgId(),
  id: text('id').notNull(),
  itemId: text('item_id').notNull(),
  connectionId: text('connection_id').notNull(),
  kindHint: text('kind_hint'),
  date: text('date').notNull(),
  description: text('description').notNull(),
  merchantId: text('merchant_id'),
  merchantName: text('merchant_name'),
  mcc: text('mcc'),
  categoryId: text('category_id'),
  amountCents: integer('amount_cents').notNull(),
  rawJson: text('raw_json').notNull()
}, (t) => [
  primaryKey({ columns: [t.orgId, t.id] }),
  foreignKey({ columns: [t.orgId, t.itemId], foreignColumns: [ledgerItems.orgId, ledgerItems.id] }),
  foreignKey({ columns: [t.orgId, t.connectionId], foreignColumns: [ledgerConnections.orgId, ledgerConnections.id] }),
  index('tx_entry_idx').on(t.orgId, t.itemId),
  index('tx_merchant_idx').on(t.orgId, t.merchantId)
]);

export const dimensionValues = pgTable('dimension_values', {
  orgId: orgId(),
  id: text('id').notNull(), // Slash dimension value id, or `qbo:<Id>` for QuickBooks accounts
  dimension: text('dimension').notNull(), // 'account'
  source: text('source').$type<'slash' | 'qbo'>().notNull().default('slash'),
  qboAccountId: text('qbo_account_id'),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  updatedAt: text('updated_at').notNull()
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

export const EVIDENCE_KINDS = ['slash_history', 'qbo_history', 'mcc', 'payout_row', 'owner_answer', 'merchant_profile'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const payoutRows = pgTable('payout_rows', {
  orgId: orgId(),
  id: text('id').notNull(), // `${channel}:${payoutId}`
  channel: text('channel').notNull(),
  payoutId: text('payout_id').notNull(),
  date: text('date').notNull(),
  grossCents: integer('gross_cents').notNull(),
  feesCents: integer('fees_cents').notNull(),
  shippingCents: integer('shipping_cents').notNull(),
  netCents: integer('net_cents').notNull()
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

export const evidence = pgTable('evidence', {
  id: text('id').primaryKey(),
  orgId: orgId(),
  entryId: text('entry_id').notNull(),
  kind: text('kind').$type<EvidenceKind>().notNull(),
  reference: text('reference'),
  payoutRowId: text('payout_row_id'),
  summary: text('summary').notNull(),
  createdAt: text('created_at').notNull()
}, (t) => [
  foreignKey({ columns: [t.orgId, t.entryId], foreignColumns: [ledgerItems.orgId, ledgerItems.id] }),
  foreignKey({ columns: [t.orgId, t.payoutRowId], foreignColumns: [payoutRows.orgId, payoutRows.id] }),
  index('evidence_entry_idx').on(t.orgId, t.entryId)
]);

export const evalCases = pgTable('eval_cases', {
  orgId: orgId(),
  id: text('id').notNull(),
  kind: text('kind').$type<'golden' | 'edge' | 'refuse'>().notNull(),
  name: text('name').notNull(),
  inputJson: text('input_json').notNull(),
  expectedJson: text('expected_json').notNull()
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  orgId: orgId(),
  processId: text('process_id').notNull(),
  evalCaseId: text('eval_case_id'),
  subjectId: text('subject_id'),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  status: text('status').$type<'running' | 'ok' | 'failed'>().notNull(),
  error: text('error'),
  detailJson: text('detail_json')
}, (t) => [
  foreignKey({ columns: [t.orgId, t.evalCaseId], foreignColumns: [evalCases.orgId, evalCases.id] }),
  index('runs_process_idx').on(t.orgId, t.processId, t.startedAt)
]);

export const recommendations = pgTable('recommendations', {
  id: text('id').primaryKey(),
  orgId: orgId(),
  entryId: text('entry_id').notNull(),
  runId: text('run_id').references(() => runs.id),
  primaryValueId: text('primary_value_id'),
  action: text('action').$type<'code' | 'ask'>().notNull(),
  linesJson: text('lines_json').notNull(),
  memo: text('memo').notNull(),
  confidence: doublePrecision('confidence').notNull(),
  reasoning: text('reasoning').notNull(),
  question: text('question'),
  promptVersion: text('prompt_version').notNull(),
  model: text('model').notNull(),
  inputHash: text('input_hash').notNull(),
  tokensFresh: integer('tokens_fresh').notNull().default(0),
  tokensCacheWrite: integer('tokens_cache_write').notNull().default(0),
  tokensCacheRead: integer('tokens_cache_read').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  costUsd: doublePrecision('cost_usd').notNull().default(0),
  ttftMs: integer('ttft_ms'),
  e2eMs: integer('e2e_ms'),
  shadowAutoApprove: boolean('shadow_auto_approve').notNull().default(false),
  createdAt: text('created_at').notNull()
}, (t) => [
  foreignKey({ columns: [t.orgId, t.entryId], foreignColumns: [ledgerItems.orgId, ledgerItems.id] }),
  foreignKey({ columns: [t.orgId, t.primaryValueId], foreignColumns: [dimensionValues.orgId, dimensionValues.id] }),
  index('rec_entry_idx').on(t.orgId, t.entryId),
  index('rec_hash_idx').on(t.orgId, t.inputHash)
]);

export const decisions = pgTable('decisions', {
  id: text('id').primaryKey(),
  orgId: orgId(),
  recommendationId: text('recommendation_id').notNull().references(() => recommendations.id),
  action: text('action').$type<'approved' | 'edited' | 'asked' | 'rejected' | 'undone'>().notNull(),
  finalLinesJson: text('final_lines_json'),
  finalMemo: text('final_memo'),
  decidedBy: text('decided_by').notNull(),
  decidedAt: text('decided_at').notNull()
}, (t) => [index('decision_rec_idx').on(t.recommendationId, t.decidedAt)]);

export const questions = pgTable('questions', {
  id: text('id').primaryKey(),
  orgId: orgId(),
  entryId: text('entry_id').notNull(),
  text: text('text').notNull(),
  bestGuess: text('best_guess'),
  answer: text('answer'),
  status: text('status').$type<'open' | 'answered'>().notNull(),
  createdAt: text('created_at').notNull(),
  answeredAt: text('answered_at')
}, (t) => [foreignKey({ columns: [t.orgId, t.entryId], foreignColumns: [ledgerItems.orgId, ledgerItems.id] })]);

export const mappingProposals = pgTable('mapping_proposals', {
  id: text('id').primaryKey(),
  orgId: orgId(),
  connectionId: text('connection_id').notNull(),
  target: text('target').$type<'ledger' | 'local'>().notNull().default('ledger'),
  sourceType: text('source_type').$type<'merchant' | 'merchant_category'>().notNull(),
  sourceId: text('source_id').notNull(),
  sourceLabel: text('source_label').notNull(),
  dimension: text('dimension').notNull(),
  valueId: text('value_id').notNull(),
  supportCount: integer('support_count').notNull(),
  status: text('status').$type<'proposed' | 'applied' | 'dismissed'>().notNull(),
  createdAt: text('created_at').notNull(),
  appliedAt: text('applied_at')
}, (t) => [
  foreignKey({ columns: [t.orgId, t.connectionId], foreignColumns: [ledgerConnections.orgId, ledgerConnections.id] }),
  foreignKey({ columns: [t.orgId, t.valueId], foreignColumns: [dimensionValues.orgId, dimensionValues.id] }),
  uniqueIndex('mapping_source_idx').on(t.orgId, t.connectionId, t.sourceType, t.sourceId, t.dimension)
]);

/** In-app rules for ledgers without native mappings (Mercury). Checked by the recommend precode rule. */
export const localMappings = pgTable('local_mappings', {
  id: text('id').primaryKey(),
  orgId: orgId(),
  connectionId: text('connection_id').notNull(),
  proposalId: text('proposal_id').references(() => mappingProposals.id),
  sourceId: text('source_id').notNull(), // merchant id or normalized counterparty
  valueId: text('value_id').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull()
}, (t) => [
  foreignKey({ columns: [t.orgId, t.connectionId], foreignColumns: [ledgerConnections.orgId, ledgerConnections.id] }),
  foreignKey({ columns: [t.orgId, t.valueId], foreignColumns: [dimensionValues.orgId, dimensionValues.id] }),
  uniqueIndex('local_map_idx').on(t.orgId, t.connectionId, t.sourceId)
]);

/** One QuickBooks company per org. */
export const qboTokens = pgTable('qbo_tokens', {
  orgId: orgId().primaryKey(),
  realmId: text('realm_id').notNull(),
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  expiresAt: text('expires_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

/** Per-org on/off for registry components (processes and tools from processes.yaml). Absent row = default. */
export const componentStates = pgTable('component_states', {
  orgId: orgId(),
  componentId: text('component_id').notNull(),
  enabled: boolean('enabled').notNull(),
  configJson: text('config_json'),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull()
}, (t) => [primaryKey({ columns: [t.orgId, t.componentId] })]);

/** Tables under row-level security (drizzle/0001_rls.sql is generated from this list by scripts/gen-rls.ts). */
export const TENANT_TABLES = [
  'memberships', 'invites', 'api_tokens', 'audit_log', 'ledger_connections', 'ledger_items', 'ledger_transactions',
  'dimension_values', 'payout_rows', 'evidence', 'eval_cases', 'runs', 'recommendations', 'decisions', 'questions',
  'mapping_proposals', 'local_mappings', 'qbo_tokens', 'component_states'
] as const;
