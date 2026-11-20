// Mercury as a LedgerAdapter. API facts (docs.mercury.com, read 2026-11-20):
// - Base https://api.mercury.com/api/v1, `Authorization: Bearer secret-token:…`; read-only token is enough to pull.
// - PATCH /transaction/{id} sets only `categoryId` and `note`. `glAllocations` (the GL coding that syncs to
//   QuickBooks) is read-only, so Mercury cannot code natively → capabilities.code = 'qbo_direct'.
// - Amount sign is not documented on the transaction schema (Books docs: positive = money in). We normalize
//   to signed cents with debits negative; TBD — verify on the first live read-only pull.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppError, normalizeMerchant, sleep } from '../util';
import { backoff } from '../slash';
import { CAPABILITIES, type LedgerAdapter, type LedgerItem } from './types';

export interface MercuryAccount { id: string; name: string; kind?: string; status?: string }
export interface MercuryTransaction {
  id: string;
  accountId: string;
  amount: number; // dollars, positive = money in (per Books docs; verify live)
  createdAt: string;
  postedAt: string | null;
  status: 'pending' | 'sent' | 'cancelled' | 'failed' | 'reversed' | 'blocked';
  kind: string; // externalTransfer | internalTransfer | outgoingPayment | creditCardTransaction | debitCardTransaction | …
  counterpartyId?: string;
  counterpartyName: string;
  bankDescription: string | null;
  note: string | null;
  externalMemo: string | null;
  mercuryCategory?: string | null;
  categoryData?: { id: string; name: string } | null;
  glAllocations?: { glCodeName: string; amount: number; description?: string | null }[];
  accountingStatus?: { status: 'pending' | 'reviewed' | 'syncing' | 'synced' | 'errored' | 'excluded' } | null;
}

export interface MercuryPort {
  readonly mode: 'fixture' | 'live';
  listAccounts(): Promise<MercuryAccount[]>;
  listTransactions(opts: { accountIds?: string[]; postedStart?: string }): Promise<MercuryTransaction[]>;
  updateTransaction(id: string, body: { note?: string | null; categoryId?: string | null }): Promise<MercuryTransaction>;
}

const BASE = 'https://api.mercury.com/api/v1';

export class LiveMercury implements MercuryPort {
  readonly mode = 'live' as const;
  constructor(private token: string, private fetchImpl: typeof fetch = fetch) {
    if (!token) throw new AppError('mercury_token_missing', 'Mercury token is not set (app.mercury.com → Settings → Tokens)', 503, 'app');
  }
  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const auth = this.token.startsWith('secret-token:') ? this.token : `secret-token:${this.token}`;
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(BASE + path, {
          method, headers: { authorization: `Bearer ${auth}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000)
        });
      } catch (e) {
        if (attempt >= 5) throw new AppError('mercury_network', `Mercury unreachable: ${(e as Error).message}`, 502, 'app');
        await sleep(backoff(attempt)); continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 5) { await sleep(backoff(attempt)); continue; }
      const text = await res.text();
      if (!res.ok) throw new AppError(`mercury_${res.status}`, `Mercury ${res.status}: ${text.slice(0, 300)}`, res.status === 401 || res.status === 403 ? 422 : 502, 'app');
      return (text ? JSON.parse(text) : {}) as T;
    }
  }
  async listAccounts() {
    return (await this.req<{ accounts: MercuryAccount[] }>('GET', '/accounts')).accounts.filter((a) => a.status !== 'deleted');
  }
  async listTransactions({ accountIds, postedStart }: { accountIds?: string[]; postedStart?: string }) {
    const out: MercuryTransaction[] = [];
    let after: string | undefined;
    for (;;) {
      const q = new URLSearchParams({ limit: '1000', order: 'asc' });
      for (const id of accountIds ?? []) q.append('accountId[]', id);
      if (postedStart) q.set('postedStart', postedStart);
      if (after) q.set('start_after', after);
      const page = await this.req<{ transactions: MercuryTransaction[]; page?: { nextPage?: string | null } }>('GET', `/transactions?${q}`);
      out.push(...page.transactions);
      if (!page.page?.nextPage || !page.transactions.length) break;
      after = page.transactions[page.transactions.length - 1].id;
    }
    return out;
  }
  updateTransaction(id: string, body: { note?: string | null; categoryId?: string | null }) {
    return this.req<MercuryTransaction>('PATCH', `/transaction/${encodeURIComponent(id)}`, body);
  }
}

export class FixtureMercury implements MercuryPort {
  readonly mode = 'fixture' as const;
  accounts: MercuryAccount[];
  transactions: MercuryTransaction[];
  updates: { id: string; body: unknown }[] = [];
  failing = false;
  constructor(dir = resolve(process.cwd(), 'fixtures/mercury')) {
    this.accounts = JSON.parse(readFileSync(resolve(dir, 'accounts.json'), 'utf8'));
    this.transactions = JSON.parse(readFileSync(resolve(dir, 'transactions.json'), 'utf8'));
  }
  private check() { if (this.failing) throw new AppError('mercury_401', 'Mercury 401: invalid token (fixture set to fail)', 422, 'app'); }
  async listAccounts() { this.check(); return structuredClone(this.accounts); }
  async listTransactions({ accountIds }: { accountIds?: string[] }) {
    this.check();
    return structuredClone(this.transactions.filter((t) => !accountIds?.length || accountIds.includes(t.accountId)));
  }
  async updateTransaction(id: string, body: { note?: string | null }) {
    this.check();
    const t = this.transactions.find((x) => x.id === id);
    if (!t) throw new AppError('mercury_404', `Mercury 404: transaction ${id}`, 502, 'app');
    this.updates.push({ id, body });
    if (body.note !== undefined) t.note = body.note;
    return structuredClone(t);
  }
  addTransaction(t: MercuryTransaction) { this.transactions.push(t); }
}

const CARD = new Set(['creditCardTransaction', 'debitCardTransaction']);

export function normalizeMercury(t: MercuryTransaction): LedgerItem {
  const cents = Math.round(t.amount * 100);
  const coded = !!t.glAllocations?.length;
  const synced = t.accountingStatus?.status === 'synced' || t.accountingStatus?.status === 'excluded';
  const name = t.counterpartyName || t.bankDescription || 'Unknown';
  return {
    externalId: `mtx_${t.id}`,
    status: coded || synced ? 'synced' : 'in_review',
    amountCents: cents,
    memo: t.note ?? t.externalMemo ?? null,
    createdAt: t.createdAt,
    coding: coded ? t.glAllocations!.map((g) => ({ accountName: g.glCodeName, amountCents: (cents < 0 ? -1 : 1) * Math.abs(Math.round(g.amount * 100)), description: g.description ?? undefined })) : null,
    codedBy: coded ? 'ledger' : null,
    tx: {
      id: t.id,
      date: (t.postedAt ?? t.createdAt).slice(0, 10),
      description: t.bankDescription ? `${name} — ${t.bankDescription}` : name,
      amountCents: cents,
      accountId: t.accountId,
      merchant: { id: `cp:${normalizeMerchant(name) || t.counterpartyId || t.id}`, name, mcc: null, categoryId: t.categoryData?.id ?? null },
      kindHint: t.kind === 'internalTransfer' ? 'own_transfer' : CARD.has(t.kind) ? 'card' : undefined
    }
  };
}

export class MercuryAdapter implements LedgerAdapter {
  readonly kind = 'mercury' as const;
  readonly capabilities = CAPABILITIES.mercury;
  constructor(private port: MercuryPort, private accountIds: string[] = []) {}
  private async all() {
    return (await this.port.listTransactions({ accountIds: this.accountIds })).filter((t) => t.status === 'sent').map(normalizeMercury);
  }
  async listItems({ since }: { since?: string }) {
    return (await this.all()).filter((i) => i.status === 'in_review' && (!since || i.createdAt >= since));
  }
  async listHistory() { return (await this.all()).filter((i) => i.status !== 'in_review'); }
  async annotate(externalId: string, note: string) {
    await this.port.updateTransaction(externalId.replace(/^mtx_/, ''), { note });
  }
  async health() {
    try { const a = await this.port.listAccounts(); return { ok: true, message: `${a.length} accounts visible (${this.port.mode})` }; }
    catch (e) { return { ok: false, message: (e as Error).message }; }
  }
  listMercuryAccounts() { return this.port.listAccounts(); }
}
