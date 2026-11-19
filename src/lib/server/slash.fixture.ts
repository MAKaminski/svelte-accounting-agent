// Fixture Slash: serves fixtures/slash/*.json and records every write so tests can assert on it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MappingInput, SlashDimensionValue, SlashEntry, SlashLineItem, SlashPort, SlashTransaction } from './slash';
import { SlashHttpError } from './slash';

export interface RecordedWrite { op: 'updateEntry' | 'markReady' | 'upsertMapping'; id: string; body?: unknown; idempotencyKey: string }

export class FixtureSlash implements SlashPort {
  readonly mode = 'fixture' as const;
  entries: SlashEntry[];
  transactions: SlashTransaction[];
  accounts: SlashDimensionValue[];
  writes: RecordedWrite[] = [];
  mappings: MappingInput[] = [];
  private seenKeys = new Map<string, unknown>();
  /** Test hooks: force the next call of an op to fail. */
  failNext: Partial<Record<RecordedWrite['op'] | 'listEntries', SlashHttpError>> = {};

  constructor(dir = resolve(process.cwd(), 'fixtures/slash')) {
    const read = <T>(f: string): T => JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
    this.entries = read<SlashEntry[]>('entries.json');
    this.transactions = read<SlashTransaction[]>('transactions.json');
    this.accounts = read<SlashDimensionValue[]>('accounts.json');
  }

  private takeFail(op: keyof FixtureSlash['failNext']) {
    const e = this.failNext[op];
    if (e) { delete this.failNext[op]; throw e; }
  }

  async listEntries({ status, since }: { status: SlashEntry['status']; since?: string }) {
    this.takeFail('listEntries');
    return structuredClone(this.entries.filter((e) => e.status === status && (!since || e.createdAt >= since)));
  }
  async getTransaction(id: string) { return structuredClone(this.transactions.find((t) => t.id === id) ?? null); }
  async listTransactionsForEntries(ids: string[]) {
    const want = new Set(ids);
    return structuredClone(this.transactions.filter((t) => t.accountingEntryId && want.has(t.accountingEntryId)));
  }
  async listAccountValues() { return structuredClone(this.accounts); }

  private idem<T>(key: string, fn: () => T): T {
    if (this.seenKeys.has(key)) return this.seenKeys.get(key) as T;
    const r = fn();
    this.seenKeys.set(key, r);
    return r;
  }

  async updateEntry(id: string, body: { memo?: string; dimensions?: Record<string, string>; lineItems?: SlashLineItem[] }, key: string) {
    this.takeFail('updateEntry');
    return this.idem(key, () => {
      const e = this.entries.find((x) => x.id === id);
      if (!e) throw new SlashHttpError(404, 'not_found', `entry ${id} not found`);
      if (e.status === 'syncing' || e.status === 'pending_sync') throw new SlashHttpError(409, 'entry_sync_in_progress', 'Entry is syncing');
      if (body.lineItems) {
        const sum = body.lineItems.reduce((s, l) => s + l.amountCents, 0);
        if (sum !== e.amountCents) throw new SlashHttpError(400, 'invalid_line_items', `line items total ${sum} ≠ ${e.amountCents}`);
      }
      this.writes.push({ op: 'updateEntry', id, body, idempotencyKey: key });
      Object.assign(e, { memo: body.memo ?? e.memo, dimensions: body.dimensions ?? e.dimensions, lineItems: body.lineItems ?? e.lineItems });
      return structuredClone(e);
    });
  }

  async markReady(id: string, key: string) {
    this.takeFail('markReady');
    return this.idem(key, () => {
      const e = this.entries.find((x) => x.id === id);
      if (!e) throw new SlashHttpError(404, 'not_found', `entry ${id} not found`);
      this.writes.push({ op: 'markReady', id, idempotencyKey: key });
      e.status = 'ready_to_sync';
      return structuredClone(e);
    });
  }

  /** Simulate Slash's native sync finishing (ready_to_sync → synced). */
  syncAll() { for (const e of this.entries) if (e.status === 'ready_to_sync') e.status = 'synced'; }

  async upsertMapping(input: MappingInput, key: string) {
    this.takeFail('upsertMapping');
    return this.idem(key, () => {
      this.writes.push({ op: 'upsertMapping', id: input.source.id, body: input, idempotencyKey: key });
      this.mappings = this.mappings.filter((m) => !(m.source.type === input.source.type && m.source.id === input.source.id && m.dimension === input.dimension));
      this.mappings.push(input);
      if (input.applyToExistingEntries) for (const e of this.entries) if (e.status === 'in_review') this.applyMappings(e);
      return { id: `map_${input.source.id}` };
    });
  }

  /** Test helper: add an entry that arrives later (e.g. the next purchase from a mapped merchant). */
  addEntry(entry: SlashEntry, tx: SlashTransaction) { this.transactions.push(tx); this.entries.push(entry); this.applyMappings(entry); }

  /** Slash auto-codes by source: merchant beats merchant_category. */
  private applyMappings(e: SlashEntry) {
    const m = this.transactions.find((t) => t.accountingEntryId === e.id)?.cardDetails?.merchant;
    if (!m) return;
    const hit = this.mappings.find((x) => x.source.type === 'merchant' && x.source.id === m.id)
      ?? this.mappings.find((x) => x.source.type === 'merchant_category' && x.source.id === m.categoryCode);
    if (hit) { e.dimensions = { ...(e.dimensions ?? {}), [hit.dimension]: hit.valueId }; e.codedBy = 'mapping'; }
  }
}
