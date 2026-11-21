// Ledger adapter contract. Every ledger (Slash, Mercury, later Plaid/CSV) normalizes to LedgerItem
// and declares capabilities; the write path and mappings branch on capabilities, never on kind.
import type { Capabilities, LedgerKind } from '../db/schema';
import type { TxKind } from '../processes/rules';

export type { Capabilities, LedgerKind };

export type LedgerStatus = 'in_review' | 'ready' | 'syncing' | 'synced' | 'failed' | 'archived';

/** A coding line as the ledger reports it: by our valueId when known, else by account name (resolved later). */
export interface CodingLine { valueId?: string; accountName?: string; amountCents: number; description?: string }

export interface LedgerItem {
  externalId: string;
  status: LedgerStatus;
  amountCents: number; // signed: debits negative
  memo: string | null;
  createdAt: string;
  coding: CodingLine[] | null;
  codedBy: 'mapping' | 'ledger' | null;
  tx: {
    id: string;
    date: string;
    description: string;
    amountCents: number;
    accountId?: string; // ledger account the money moved in (Mercury account id)
    merchant: { id: string; name: string; mcc: string | null; categoryId: string | null } | null;
    kindHint?: TxKind;
  };
}

export interface LedgerAccount { id: string; name: string; enabled: boolean }

export interface CodeInput { memo?: string; lines: { valueId: string; amountCents: number; description?: string }[] }

export interface MappingInput {
  source: { type: 'merchant' | 'merchant_category'; id: string };
  dimension: string;
  valueId: string;
  applyToExistingEntries: boolean;
}

export interface LedgerAdapter {
  readonly kind: LedgerKind;
  readonly capabilities: Capabilities;
  /** Items waiting for review. */
  listItems(opts: { since?: string }): Promise<LedgerItem[]>;
  /** Already-coded items (history for research) and items we pushed forward (status sweep). */
  listHistory(): Promise<LedgerItem[]>;
  /** Chart of accounts when capabilities.chart === 'ledger'. */
  listAccounts?(): Promise<LedgerAccount[]>;
  /** Native coding when capabilities.code === 'ledger'. */
  code?(externalId: string, input: CodeInput, idempotencyKey: string): Promise<void>;
  markReady?(externalId: string, idempotencyKey: string): Promise<LedgerStatus>;
  upsertMapping?(input: MappingInput, idempotencyKey: string): Promise<void>;
  /** Optional note on the ledger's own transaction (e.g. Mercury PATCH note). */
  annotate?(externalId: string, note: string, idempotencyKey: string): Promise<void>;
  health(): Promise<{ ok: boolean; message: string }>;
}

export const CAPABILITIES: Record<LedgerKind, Capabilities> = {
  slash: { reviewUnit: 'accounting_entry', chart: 'ledger', code: 'ledger', markReady: true, mappings: 'ledger', annotate: false },
  mercury: { reviewUnit: 'transaction', chart: 'qbo', code: 'qbo_direct', markReady: false, mappings: 'local', annotate: true }
};
