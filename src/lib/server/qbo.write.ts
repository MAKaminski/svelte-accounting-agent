// QuickBooks write port — used ONLY for ledgers whose capability is code: 'qbo_direct' (Mercury), only after a
// human decision, only after dedupe, and only with a requestid (QuickBooks' idempotency) = decision id.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppError } from './util';
import type { LiveQbo } from './qbo';

export interface QboTxn {
  id: string;
  type: 'Purchase' | 'Deposit';
  date: string;
  bankAccountId: string;
  totalCents: number; // signed from the bank's view: Purchase negative, Deposit positive
  privateNote?: string;
  lines: { accountId: string; accountName: string; amountCents: number; description?: string }[];
  syncToken?: string;
}

export interface CreateInput {
  type: 'Purchase' | 'Deposit';
  bankAccountId: string;
  date: string;
  lines: { accountId: string; amountCents: number; description?: string }[]; // positive amounts
  privateNote: string;
  payeeName?: string;
}

export interface QboWritePort {
  readonly mode: 'fixture' | 'live';
  findCandidates(q: { bankAccountId: string; amountCents: number; date: string; days: number }): Promise<QboTxn[]>;
  create(input: CreateInput, requestId: string): Promise<QboTxn>;
  updateLineAccounts(txn: QboTxn, lines: { accountId: string; amountCents: number; description?: string }[], requestId: string): Promise<QboTxn>;
}

const DAY = 86_400_000;
const within = (a: string, b: string, days: number) => Math.abs(Date.parse(a) - Date.parse(b)) <= days * DAY;

export class FixtureQboWriter implements QboWritePort {
  readonly mode = 'fixture' as const;
  txns: QboTxn[];
  writes: { op: 'create' | 'update'; requestId: string; txn: QboTxn }[] = [];
  private seen = new Map<string, QboTxn>();
  failing = false;
  private accounts: Map<string, string>;
  constructor(dir = resolve(process.cwd(), 'fixtures/qbo')) {
    this.txns = JSON.parse(readFileSync(resolve(dir, 'txns.json'), 'utf8'));
    this.accounts = new Map((JSON.parse(readFileSync(resolve(dir, 'accounts.json'), 'utf8')) as { id: string; name: string }[]).map((a) => [a.id, a.name]));
  }
  private check() { if (this.failing) throw new AppError('qbo_unavailable', 'QuickBooks writer fixture set to fail', 502, 'qbo'); }
  async findCandidates({ bankAccountId, amountCents, date, days }: { bankAccountId: string; amountCents: number; date: string; days: number }) {
    this.check();
    return structuredClone(this.txns.filter((t) => t.bankAccountId === bankAccountId && t.totalCents === amountCents && within(t.date, date, days)));
  }
  async create(input: CreateInput, requestId: string) {
    this.check();
    const hit = this.seen.get(requestId);
    if (hit) return structuredClone(hit); // QuickBooks returns the original object for a repeated requestid
    const sign = input.type === 'Purchase' ? -1 : 1;
    const txn: QboTxn = {
      id: `qb_${this.txns.length + 1000}`, type: input.type, date: input.date, bankAccountId: input.bankAccountId,
      totalCents: sign * input.lines.reduce((s, l) => s + l.amountCents, 0), privateNote: input.privateNote,
      lines: input.lines.map((l) => ({ ...l, accountName: this.accounts.get(l.accountId) ?? l.accountId }))
    };
    this.txns.push(txn);
    this.seen.set(requestId, txn);
    this.writes.push({ op: 'create', requestId, txn: structuredClone(txn) });
    return structuredClone(txn);
  }
  async updateLineAccounts(txn: QboTxn, lines: { accountId: string; amountCents: number; description?: string }[], requestId: string) {
    this.check();
    const hit = this.seen.get(requestId);
    if (hit) return structuredClone(hit);
    const t = this.txns.find((x) => x.id === txn.id);
    if (!t) throw new AppError('qbo_not_found', `QuickBooks ${txn.type} ${txn.id} not found`, 502, 'qbo');
    t.lines = lines.map((l) => ({ ...l, accountName: this.accounts.get(l.accountId) ?? l.accountId }));
    this.seen.set(requestId, t);
    this.writes.push({ op: 'update', requestId, txn: structuredClone(t) });
    return structuredClone(t);
  }
}

/** Live writer on the QuickBooks Online REST API (v3). TBD — exercise against the Intuit sandbox before production. */
export class LiveQboWriter implements QboWritePort {
  readonly mode = 'live' as const;
  constructor(private qbo: LiveQbo) {}
  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const { token, realmId, base } = await this.qbo.session();
    const res = await fetch(`${base}/v3/company/${realmId}${path}${path.includes('?') ? '&' : '?'}minorversion=75`, {
      method, headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000)
    });
    const text = await res.text();
    if (!res.ok) throw new AppError('qbo_write_failed', `QuickBooks ${res.status}: ${text.slice(0, 300)}`, 502, 'qbo');
    return JSON.parse(text) as T;
  }
  private toTxn(type: 'Purchase' | 'Deposit', o: Record<string, any>): QboTxn {
    const lines = (o.Line ?? []).filter((l: any) => l.AccountBasedExpenseLineDetail || l.DepositLineDetail).map((l: any) => {
      const ref = (l.AccountBasedExpenseLineDetail ?? l.DepositLineDetail).AccountRef;
      return { accountId: ref.value, accountName: ref.name ?? ref.value, amountCents: Math.round(l.Amount * 100), description: l.Description };
    });
    return { id: o.Id, type, date: o.TxnDate, bankAccountId: (o.AccountRef ?? o.DepositToAccountRef)?.value, totalCents: (type === 'Purchase' ? -1 : 1) * Math.round(o.TotalAmt * 100), privateNote: o.PrivateNote, lines, syncToken: o.SyncToken };
  }
  async findCandidates({ bankAccountId, amountCents, date, days }: { bankAccountId: string; amountCents: number; date: string; days: number }) {
    const type = amountCents < 0 ? 'Purchase' : 'Deposit';
    const from = new Date(Date.parse(date) - days * DAY).toISOString().slice(0, 10);
    const to = new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
    const amt = (Math.abs(amountCents) / 100).toFixed(2);
    const sql = `select * from ${type} where TxnDate >= '${from}' and TxnDate <= '${to}' and TotalAmt = '${amt}'`;
    const r = await this.call<{ QueryResponse: Record<string, any[]> }>('GET', `/query?query=${encodeURIComponent(sql)}`);
    return (r.QueryResponse[type] ?? []).map((o) => this.toTxn(type, o)).filter((t) => t.bankAccountId === bankAccountId);
  }
  async create(input: CreateInput, requestId: string) {
    const lines = input.lines.map((l) => input.type === 'Purchase'
      ? { Amount: l.amountCents / 100, DetailType: 'AccountBasedExpenseLineDetail', Description: l.description, AccountBasedExpenseLineDetail: { AccountRef: { value: l.accountId } } }
      : { Amount: l.amountCents / 100, DetailType: 'DepositLineDetail', Description: l.description, DepositLineDetail: { AccountRef: { value: l.accountId } } });
    const body = input.type === 'Purchase'
      ? { PaymentType: 'Cash', AccountRef: { value: input.bankAccountId }, TxnDate: input.date, PrivateNote: input.privateNote, Line: lines }
      : { DepositToAccountRef: { value: input.bankAccountId }, TxnDate: input.date, PrivateNote: input.privateNote, Line: lines };
    const r = await this.call<Record<string, any>>('POST', `/${input.type.toLowerCase()}?requestid=${encodeURIComponent(requestId)}`, body);
    return this.toTxn(input.type, r[input.type]);
  }
  async updateLineAccounts(txn: QboTxn, lines: { accountId: string; amountCents: number; description?: string }[], requestId: string) {
    const Line = lines.map((l) => txn.type === 'Purchase'
      ? { Amount: l.amountCents / 100, DetailType: 'AccountBasedExpenseLineDetail', Description: l.description, AccountBasedExpenseLineDetail: { AccountRef: { value: l.accountId } } }
      : { Amount: l.amountCents / 100, DetailType: 'DepositLineDetail', Description: l.description, DepositLineDetail: { AccountRef: { value: l.accountId } } });
    const r = await this.call<Record<string, any>>('POST', `/${txn.type.toLowerCase()}?requestid=${encodeURIComponent(requestId)}`, { Id: txn.id, SyncToken: txn.syncToken, sparse: true, Line });
    return this.toTxn(txn.type, r[txn.type]);
  }
}
