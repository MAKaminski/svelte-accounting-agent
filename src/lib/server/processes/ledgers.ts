// FE.ledgers.list / FE.ledger.add / FE.ledger.toggle / MW.ledger.test — ledger connection management.
import { getDb, schema } from '../db';
import { AppError } from '../util';
import { withRun } from './runs';
import { bankAccountsFromQbo } from './coa';
import {
  addConnection, connectionView, getAdapter, getConnection, listConnections, setConnectionStatus, updateConnection, capabilitiesOf,
  type ConnectionRow
} from '../ledgers/registry';
import { MercuryAdapter } from '../ledgers/mercury';
import type { LedgerKind } from '../ledgers/types';

async function counts() {
  const m = new Map<string, { inReview: number; total: number }>();
  for (const r of await getDb().select({ c: schema.ledgerItems.connectionId, s: schema.ledgerItems.localState }).from(schema.ledgerItems).all()) {
    const x = m.get(r.c) ?? { inReview: 0, total: 0 };
    x.total++;
    if (['fetched', 'researched', 'recommended', 'invalid', 'asked', 'approved'].includes(r.s)) x.inReview++;
    m.set(r.c, x);
  }
  return m;
}

export async function listLedgers() {
  const c = await counts();
  return (await listConnections()).map((row) => connectionView(row, c.get(row.id)));
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
  const c = await counts();
  let ledgerAccounts: { id: string; name: string }[] = [];
  let qboBankAccounts: { id: string; name: string }[] = [];
  try {
    const a = await getAdapter(row.id);
    if (a instanceof MercuryAdapter) ledgerAccounts = (await a.listMercuryAccounts()).map((x) => ({ id: x.id, name: x.name }));
  } catch { /* shown via health/test */ }
  if (capabilitiesOf(row).code === 'qbo_direct') {
    try { qboBankAccounts = (await bankAccountsFromQbo()).map((x) => ({ id: x.id, name: x.name })); } catch { /* QuickBooks not connected */ }
  }
  return { ...connectionView(row, c.get(row.id)), health, ledgerAccounts, qboBankAccounts };
}

export const showLedger = async (id: string) => await detail(await getConnection(id), null);

export async function testLedger(id: string) {
  return withRun('MW.ledger.test', id, async () => {
    const row = await getConnection(id);
    const health = await (await getAdapter(id)).health();
    return await detail(row, health);
  });
}

export async function addLedger(body: { kind?: string; name?: string; mode?: string; token?: string; qboBank?: string; confirmBankFeed?: boolean; by?: string; legalEntity?: string }) {
  return withRun('FE.ledger.add', null, async () => {
    const row = await addConnection({
      kind: (body.kind ?? '') as LedgerKind, name: body.name ?? '', mode: body.mode === 'live' ? 'live' : 'fixture',
      token: body.token || undefined, bankFeedConfirmed: !!body.confirmBankFeed, by: body.by,
      config: { qboBankAccountIdByAccount: parseBankMap(body.qboBank) ?? {}, ...(body.legalEntity ? { legalEntityId: body.legalEntity } : {}) }
    });
    return connectionView(row);
  });
}

export async function configureLedger(id: string, body: { qboBank?: string; confirmBankFeed?: boolean; by?: string; mode?: string; token?: string; legalEntity?: string }) {
  return withRun('FE.ledger.add', id, async () => {
    const map = parseBankMap(body.qboBank);
    const patch: Parameters<typeof updateConnection>[1] = { by: body.by };
    if (map || body.legalEntity !== undefined) patch.config = { ...(map ? { qboBankAccountIdByAccount: map } : {}), ...(body.legalEntity !== undefined ? { legalEntityId: body.legalEntity } : {}) };
    if (body.mode === 'live' || body.mode === 'fixture') patch.mode = body.mode;
    if (body.token) patch.token = body.token;
    if (body.confirmBankFeed !== undefined) patch.bankFeedConfirmed = body.confirmBankFeed;
    return connectionView(await updateConnection(id, patch), (await counts()).get(id));
  });
}

export async function setLedgerActive(id: string, active: boolean) {
  return withRun('FE.ledger.toggle', id, async () => connectionView(await setConnectionStatus(id, active), (await counts()).get(id)));
}
