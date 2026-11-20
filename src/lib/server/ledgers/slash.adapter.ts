// Slash as a LedgerAdapter. Wraps SlashPort (LiveSlash | FixtureSlash) without changing its behavior.
import type { SlashEntry, SlashPort, SlashTransaction } from '../slash';
import { CAPABILITIES, type CodeInput, type LedgerAdapter, type LedgerItem, type LedgerStatus, type MappingInput } from './types';

const STATUS: Record<SlashEntry['status'], LedgerStatus> = {
  in_review: 'in_review', ready_to_sync: 'ready', pending_sync: 'syncing', syncing: 'syncing', synced: 'synced', failed: 'failed', archived: 'archived'
};

export function normalizeSlash(e: SlashEntry, t: SlashTransaction | undefined): LedgerItem {
  const m = t?.cardDetails?.merchant;
  const coding = e.lineItems?.length
    ? e.lineItems.filter((l) => l.dimensions?.account).map((l) => ({ valueId: l.dimensions!.account, amountCents: l.amountCents, description: l.description }))
    : e.dimensions?.account ? [{ valueId: e.dimensions.account, amountCents: e.amountCents }] : null;
  return {
    externalId: e.id,
    status: STATUS[e.status] ?? 'in_review',
    amountCents: e.amountCents,
    memo: e.memo ?? null,
    createdAt: e.createdAt,
    coding,
    codedBy: e.codedBy === 'mapping' ? 'mapping' : coding ? 'ledger' : null,
    tx: {
      id: t?.id ?? `tx_${e.id}`,
      date: t?.date ?? e.createdAt.slice(0, 10),
      description: t?.description ?? e.memo ?? e.id,
      amountCents: t?.amountCents ?? e.amountCents,
      merchant: m?.id ? { id: m.id, name: m.description ?? m.id, mcc: m.categoryCode ?? null, categoryId: m.categoryId ?? null } : null
    }
  };
}

export class SlashAdapter implements LedgerAdapter {
  readonly kind = 'slash' as const;
  readonly capabilities = CAPABILITIES.slash;
  constructor(private port: SlashPort) {}

  private async withTx(entries: SlashEntry[]): Promise<LedgerItem[]> {
    const txs = await this.port.listTransactionsForEntries(entries.map((e) => e.id));
    const byEntry = new Map(txs.map((t) => [t.accountingEntryId!, t]));
    return entries.map((e) => normalizeSlash(e, byEntry.get(e.id)));
  }
  async listItems({ since }: { since?: string }) {
    return this.withTx(await this.port.listEntries({ status: 'in_review', since }));
  }
  async listHistory() {
    const [ready, synced] = await Promise.all([this.port.listEntries({ status: 'ready_to_sync' }), this.port.listEntries({ status: 'synced' })]);
    return this.withTx([...ready, ...synced]);
  }
  async listAccounts() {
    return (await this.port.listAccountValues()).map((v) => ({ id: v.id, name: v.name, enabled: v.enabled !== false && !v.archived }));
  }
  async code(externalId: string, input: CodeInput, key: string) {
    const body = input.lines.length === 1
      ? { memo: input.memo, dimensions: { account: input.lines[0].valueId } }
      : { memo: input.memo, lineItems: input.lines.map((l) => ({ amountCents: l.amountCents, description: l.description, dimensions: { account: l.valueId } })) };
    await this.port.updateEntry(externalId, body, key);
  }
  async markReady(externalId: string, key: string) {
    const e = await this.port.markReady(externalId, key);
    return STATUS[e.status] ?? 'ready';
  }
  async upsertMapping(input: MappingInput, key: string) {
    await this.port.upsertMapping(input, key);
  }
  async health() {
    try { const a = await this.port.listAccountValues(); return { ok: true, message: `${a.length} accounts visible (${this.port.mode})` }; }
    catch (e) { return { ok: false, message: (e as Error).message }; }
  }
}
