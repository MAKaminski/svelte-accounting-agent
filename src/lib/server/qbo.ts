// QuickBooks Online: READ-ONLY in v1. Slash is the only write path to QuickBooks.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppError } from './util';
import { env } from './env';

export interface QboPurchase { id: string; date: string; vendorName: string; amountCents: number; accountName: string }
export interface QboVendor { id: string; name: string }

export interface QboPort {
  readonly mode: 'fixture' | 'live';
  connected(): boolean;
  listVendors(): Promise<QboVendor[]>;
  purchasesByVendor(vendorId: string): Promise<QboPurchase[]>;
}

export class FixtureQbo implements QboPort {
  readonly mode = 'fixture' as const;
  private vendors: QboVendor[];
  private purchases: (QboPurchase & { vendorId: string })[];
  failing = false;
  constructor(dir = resolve(process.cwd(), 'fixtures/qbo')) {
    this.vendors = JSON.parse(readFileSync(resolve(dir, 'vendors.json'), 'utf8'));
    this.purchases = JSON.parse(readFileSync(resolve(dir, 'purchases.json'), 'utf8'));
  }
  connected() { return true; }
  async listVendors() {
    if (this.failing) throw new AppError('qbo_unavailable', 'QuickBooks fixture set to fail', 502, 'qbo');
    return structuredClone(this.vendors);
  }
  async purchasesByVendor(vendorId: string) {
    if (this.failing) throw new AppError('qbo_unavailable', 'QuickBooks fixture set to fail', 502, 'qbo');
    return structuredClone(this.purchases.filter((p) => p.vendorId === vendorId));
  }
}

const QBO_BASE = { sandbox: 'https://sandbox-quickbooks.api.intuit.com', production: 'https://quickbooks.api.intuit.com' };
export const QBO_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
export const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export interface QboTokenStore {
  get(): { realmId: string; accessToken: string; refreshToken: string; expiresAt: string } | null;
  save(t: { realmId: string; accessToken: string; refreshToken: string; expiresAt: string }): void;
}

/** Live client: OAuth 2.0 with rotating refresh tokens, read-only queries, 24 h cache, 500/min limiter, 10 s timeout. */
export class LiveQbo implements QboPort {
  readonly mode = 'live' as const;
  private cache = new Map<string, { at: number; value: unknown }>();
  private window: number[] = [];
  constructor(private tokens: QboTokenStore) {}
  connected() { return this.tokens.get() !== null; }

  private async accessToken(): Promise<{ token: string; realmId: string }> {
    const t = this.tokens.get();
    if (!t) throw new AppError('qbo_not_connected', 'QuickBooks is not connected (Settings → Connect QuickBooks)', 503, 'qbo');
    if (Date.parse(t.expiresAt) - Date.now() > 60_000) return { token: t.accessToken, realmId: t.realmId };
    const res = await fetch(QBO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded', accept: 'application/json',
        authorization: 'Basic ' + Buffer.from(`${env('QBO_CLIENT_ID')}:${env('QBO_CLIENT_SECRET')}`).toString('base64')
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refreshToken }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) throw new AppError('qbo_refresh_failed', `QuickBooks token refresh failed (${res.status}); reconnect in Settings`, 502, 'qbo');
    const j = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
    const next = { realmId: t.realmId, accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: new Date(Date.now() + j.expires_in * 1000).toISOString() };
    this.tokens.save(next); // refresh tokens rotate: always persist the new one
    return { token: next.accessToken, realmId: next.realmId };
  }

  private async query<T>(sql: string): Promise<T[]> {
    const hit = this.cache.get(sql);
    if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.value as T[];
    const now = Date.now();
    this.window = this.window.filter((t) => now - t < 60_000);
    if (this.window.length >= 500) throw new AppError('qbo_rate_limited', 'Local QuickBooks limiter: 500 requests/min', 502, 'qbo');
    this.window.push(now);
    const { token, realmId } = await this.accessToken();
    const base = QBO_BASE[env('QBO_ENV', 'sandbox') as 'sandbox' | 'production'];
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${base}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=75`, {
          headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000)
        });
        if (!res.ok) throw new AppError('qbo_error', `QuickBooks ${res.status}`, 502, 'qbo');
        const j = await res.json() as { QueryResponse: Record<string, T[]> };
        const rows = Object.values(j.QueryResponse).find(Array.isArray) ?? [];
        this.cache.set(sql, { at: Date.now(), value: rows });
        return rows;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  async listVendors() {
    const rows = await this.query<{ Id: string; DisplayName: string }>('select Id, DisplayName from Vendor maxresults 1000');
    return rows.map((r) => ({ id: r.Id, name: r.DisplayName }));
  }
  async purchasesByVendor(vendorId: string) {
    type P = { Id: string; TxnDate: string; TotalAmt: number; EntityRef?: { name: string }; Line?: { AccountBasedExpenseLineDetail?: { AccountRef?: { name: string } } }[] };
    const rows = await this.query<P>(`select * from Purchase where EntityRef = '${vendorId.replace(/'/g, '')}' maxresults 50`);
    return rows.map((r) => ({
      id: r.Id, date: r.TxnDate, vendorName: r.EntityRef?.name ?? '', amountCents: -Math.round(r.TotalAmt * 100),
      accountName: r.Line?.find((l) => l.AccountBasedExpenseLineDetail)?.AccountBasedExpenseLineDetail?.AccountRef?.name ?? 'unknown'
    }));
  }
}
