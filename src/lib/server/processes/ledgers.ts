// FE.ledgers.list / FE.ledger.add / FE.ledger.toggle / MW.ledger.test — ledger connection management.
import { getDb, schema } from '../db';
import { AppError } from '../util';
import { withRun } from './runs';
import { bankAccountsFromQbo } from './coa';
import {
  addConnection, connectionView, getAdapter, getConnection, listConnections, setConnectionStatus, updateConnection, capabilitiesOf,
  type ConnectionConfig, type ConnectionRow
} from '../ledgers/registry';
import { MercuryAdapter } from '../ledgers/mercury';
import type { LedgerKind } from '../ledgers/types';

function counts() {
  const m = new Map<string, { inReview: number; total: number }>();
  for (const r of getDb().select({ c: schema.ledgerItems.connectionId, s: schema.ledgerItems.localState }).from(schema.ledgerItems).all()) {
    const x = m.get(r.c) ?? { inReview: 0, total: 0 };
    x.total++;
    if (['fetched', 'researched', 'recommended', 'invalid', 'asked', 'approved'].includes(r.s)) x.inReview++;
    m.set(r.c, x);
  }
  return m;
}

export function listLedgers() {
  const c = counts();
  return listConnections().map((row) => connectionView(row, c.get(row.id)));
}

/** "acc_chk=10,acc_sav=12" → { acc_chk: '10', acc_sav: '12' } */
export function parseBankMap(s: string | undefined): Record<string, string> | undefined {
  if (!s) return undefined;
  const out: Record<string, string> = {};
  for (const pair of s.split(',').map((x) => x.trim()).filter(Boolean)) {
    const [k, v] = pair.split('=').map((x) => x.trim());
    if (!k || !v) throw new AppError('bad_mapping', `bad mapping "${pair}" — use ledgerAccount=qboBankAccountId`, 400);
    out[k] = v;
  }
  return out;
}

async function detail(row: ConnectionRow, health: { ok: boolean; message: string } | null) {
  const c = counts();
  let ledgerAccounts: { id: string; name: string }[] = [];
  let qboBankAccounts: { id: string; name: string }[] = [];
  try {
    const a = getAdapter(row.id);
    if (a instanceof MercuryAdapter) ledgerAccounts = (await a.listMercuryAccounts()).map((x) => ({ id: x.id, name: x.name }));
  } catch { /* shown via health/test */ }
  if (capabilitiesOf(row).code === 'qbo_direct') {
    try { qboBankAccounts = (await bankAccountsFromQbo()).map((x) => ({ id: x.id, name: x.name })); } catch { /* QuickBooks not connected */ }
  }
  return { ...connectionView(row, c.get(row.id)), health, ledgerAccounts, qboBankAccounts };
}

export const showLedger = (id: string) => detail(getConnection(id), null);

export async function testLedger(id: string) {
  return withRun('MW.ledger.test', id, async () => {
    const row = getConnection(id);
    const health = await getAdapter(id).health();
    return detail(row, health);
  });
}

export async function addLedger(body: { kind?: string; name?: string; mode?: string; token?: string; qboBank?: string; confirmBankFeed?: boolean; by?: string }) {
  return withRun('FE.ledger.add', null, async () => {
    const row = addConnection({
      kind: (body.kind ?? '') as LedgerKind, name: body.name ?? '', mode: body.mode === 'live' ? 'live' : 'fixture',
      token: body.token || undefined, bankFeedConfirmed: !!body.confirmBankFeed, by: body.by,
      config: { qboBankAccountIdByAccount: parseBankMap(body.qboBank) ?? {} }
    });
    return connectionView(row);
  });
}

export async function configureLedger(id: string, body: { qboBank?: string; confirmBankFeed?: boolean; by?: string }) {
  return withRun('FE.ledger.add', id, async () => {
    const map = parseBankMap(body.qboBank);
    const patch: { config?: ConnectionConfig; bankFeedConfirmed?: boolean; by?: string } = { by: body.by };
    if (map) patch.config = { qboBankAccountIdByAccount: map };
    if (body.confirmBankFeed !== undefined) patch.bankFeedConfirmed = body.confirmBankFeed;
    return connectionView(updateConnection(id, patch), counts().get(id));
  });
}

export async function setLedgerActive(id: string, active: boolean) {
  return withRun('FE.ledger.toggle', id, async () => connectionView(setConnectionStatus(id, active), counts().get(id)));
}
