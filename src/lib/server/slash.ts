// Slash API client (v2). fetch-based so every v2 accounting route is reachable without SDK coverage risk.
// Read: entries, transactions, dimensions. Write: entry coding, mark-ready, mappings. Never money movement.
import { AppError, sleep } from './util';
import { env } from './env';

export interface SlashMerchant { id?: string; description?: string; categoryCode?: string; categoryId?: string }
export interface SlashTransaction {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  accountingEntryId?: string;
  cardDetails?: { merchant?: SlashMerchant };
  [k: string]: unknown;
}
export interface SlashLineItem { amountCents: number; description?: string; dimensions?: Record<string, string> }
export interface SlashEntry {
  id: string;
  status: 'in_review' | 'ready_to_sync' | 'pending_sync' | 'syncing' | 'synced' | 'failed' | 'archived';
  amountCents: number;
  memo?: string | null;
  transactionId?: string;
  dimensions?: Record<string, string>;
  lineItems?: SlashLineItem[];
  createdAt: string;
  [k: string]: unknown;
}
export interface SlashDimensionValue { id: string; name: string; enabled?: boolean; archived?: boolean }
export interface MappingInput {
  source: { type: 'merchant' | 'merchant_category'; id: string };
  dimension: string;
  valueId: string;
  applyToExistingEntries: boolean;
}

export interface SlashPort {
  readonly mode: 'fixture' | 'live';
  listEntries(opts: { status: SlashEntry['status']; since?: string }): Promise<SlashEntry[]>;
  getTransaction(id: string): Promise<SlashTransaction | null>;
  listTransactionsForEntries(entryIds: string[]): Promise<SlashTransaction[]>;
  listAccountValues(): Promise<SlashDimensionValue[]>;
  updateEntry(id: string, body: { memo?: string; dimensions?: Record<string, string>; lineItems?: SlashLineItem[] }, idempotencyKey: string): Promise<SlashEntry>;
  markReady(id: string, idempotencyKey: string): Promise<SlashEntry>;
  upsertMapping(input: MappingInput, idempotencyKey: string): Promise<{ id: string }>;
}

export class SlashHttpError extends AppError {
  constructor(public httpStatus: number, public slashCode: string, message: string) {
    super(`slash_${slashCode}`, `Slash ${httpStatus}: ${message}`, httpStatus === 409 ? 409 : httpStatus >= 500 || httpStatus === 429 ? 502 : 422, 'slash');
  }
}

const BASE = 'https://api.slash.com';
const TIMEOUT_MS = 10_000;
const MAX_TRIES = 5;

export class LiveSlash implements SlashPort {
  readonly mode = 'live' as const;
  constructor(private apiKey = env('SLASH_API_KEY'), private legalEntity = env('SLASH_LEGAL_ENTITY_ID'), private fetchImpl: typeof fetch = fetch) {
    if (!apiKey) throw new AppError('slash_key_missing', 'SLASH_API_KEY is not set (Slash dashboard → Settings → Developer)', 503, 'slash');
  }

  private async req<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = { 'X-API-Key': this.apiKey, accept: 'application/json' };
    if (this.legalEntity) headers['x-legal-entity'] = this.legalEntity;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
    for (let attempt = 1; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await this.fetchImpl(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
      } catch (e) {
        clearTimeout(timer);
        if (attempt >= MAX_TRIES) throw new SlashHttpError(504, 'network', (e as Error).message);
        await sleep(backoff(attempt));
        continue;
      }
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= MAX_TRIES) throw new SlashHttpError(res.status, res.status === 429 ? 'rate_limited' : 'server_error', await res.text());
        await sleep(backoff(attempt));
        continue;
      }
      const text = await res.text();
      if (!res.ok) {
        let code = 'error';
        let message = text;
        try { const j = JSON.parse(text); code = j.code ?? j.error?.code ?? code; message = j.message ?? j.error?.message ?? text; } catch { /* plain text */ }
        throw new SlashHttpError(res.status, code, message);
      }
      return (text ? JSON.parse(text) : {}) as T;
    }
  }

  private async paginate<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    do {
      const sep = path.includes('?') ? '&' : '?';
      const page = await this.req<{ items?: T[]; data?: T[]; metadata?: { nextCursor?: string }; nextCursor?: string }>('GET', path + (cursor ? `${sep}cursor=${encodeURIComponent(cursor)}` : ''));
      out.push(...(page.items ?? page.data ?? []));
      cursor = page.metadata?.nextCursor ?? page.nextCursor ?? undefined;
    } while (cursor);
    return out;
  }

  listEntries(opts: { status: SlashEntry['status']; since?: string }) {
    const q = new URLSearchParams({ 'filter:status': opts.status });
    if (opts.since) q.set('filter:from_date', opts.since);
    return this.paginate<SlashEntry>(`/v2/accounting/entries?${q}`);
  }
  async getTransaction(id: string) {
    try { return await this.req<SlashTransaction>('GET', `/v2/transactions/${encodeURIComponent(id)}`); }
    catch (e) { if (e instanceof SlashHttpError && e.httpStatus === 404) return null; throw e; }
  }
  async listTransactionsForEntries(entryIds: string[]) {
    // TBD — verify filter name against docs.slash.com once a live key exists; fall back to per-entry lookups.
    const want = new Set(entryIds);
    const all = await this.paginate<SlashTransaction>('/v2/transactions');
    return all.filter((t) => t.accountingEntryId && want.has(t.accountingEntryId));
  }
  async listAccountValues() {
    const dims = await this.paginate<{ id: string; name: string; type?: string }>('/v2/accounting/dimensions');
    const account = dims.find((d) => (d.type ?? d.name).toLowerCase() === 'account');
    if (!account) throw new AppError('slash_no_account_dimension', 'Slash has no "account" dimension. Is the QuickBooks accounting connection active?', 502, 'slash');
    return this.paginate<SlashDimensionValue>(`/v2/accounting/dimensions/${account.id}/values`);
  }
  updateEntry(id: string, body: object, key: string) {
    return this.req<SlashEntry>('PATCH', `/v2/accounting/entries/${encodeURIComponent(id)}`, body, key);
  }
  markReady(id: string, key: string) {
    return this.req<SlashEntry>('POST', `/v2/accounting/entries/${encodeURIComponent(id)}/mark-ready`, {}, key);
  }
  upsertMapping(input: MappingInput, key: string) {
    return this.req<{ id: string }>('PUT', '/v2/accounting/mappings', input, key);
  }
}

/** Exponential backoff with full jitter: base 500 ms. */
export const backoff = (attempt: number) => Math.random() * 500 * 2 ** (attempt - 1);
