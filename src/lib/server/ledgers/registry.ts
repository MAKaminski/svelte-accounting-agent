// Ledger connections: CRUD, encrypted credentials, and the adapter for each connection.
import { eq } from 'drizzle-orm';
import { currentOrgId, getDb, schema } from '../db';
import { getPorts } from '../ports';
import { config } from '../env';
import { AppError, newId, nowIso } from '../util';
import { decrypt, encrypt } from '../qbo.tokens';
import { CAPABILITIES, type Capabilities, type LedgerAdapter, type LedgerKind } from './types';
import { SlashAdapter } from './slash.adapter';
import { LiveMercury, MercuryAdapter } from './mercury';
import { LiveSlash } from '../slash';
import { getProfile } from '../profile';
import { KEY_HELP } from '../../ledgerKeys';
export { KEY_HELP };

export type ConnectionRow = typeof schema.ledgerConnections.$inferSelect;
export interface ConnectionConfig {
  /** Mercury: which Mercury accounts to pull (empty = all). */
  accountIds?: string[];
  /** qbo_direct: Mercury account id → QuickBooks bank account id. */
  qboBankAccountIdByAccount?: Record<string, string>;
  /** Slash: legal entity header for multi-entity accounts. */
  legalEntityId?: string;
}

export const DEFAULT_SLASH_ID = 'conn_slash';

export function capabilitiesOf(c: Pick<ConnectionRow, 'capabilitiesJson'>): Capabilities {
  return JSON.parse(c.capabilitiesJson) as Capabilities;
}
export function configOf(c: Pick<ConnectionRow, 'configJson'>): ConnectionConfig {
  return JSON.parse(c.configJson || '{}') as ConnectionConfig;
}

/** Which chart of accounts a connection's items are coded against. */
export async function chartSourceOf(connectionId: string): Promise<'slash' | 'qbo'> {
  const c = await getDb().select().from(schema.ledgerConnections).where(eq(schema.ledgerConnections.id, connectionId)).get();
  return c && capabilitiesOf(c).chart === 'qbo' ? 'qbo' : 'slash';
}

/** Demo companies only: a sample Slash connection (mode follows SLASH_MODE). Real companies add their own. */
export async function ensureDefaultConnections() {
  const db = getDb();
  if (await db.select().from(schema.ledgerConnections).limit(1).get()) return;
  if (!(await getProfile(currentOrgId()!)).sampleData) return;
  await db.insert(schema.ledgerConnections).values({
    id: DEFAULT_SLASH_ID, kind: 'slash', name: 'Slash', mode: config.slashMode, status: 'active',
    configJson: '{}', capabilitiesJson: JSON.stringify(CAPABILITIES.slash), createdAt: nowIso(), updatedAt: nowIso()
  }).run();
}

export async function listConnections(): Promise<ConnectionRow[]> {
  await ensureDefaultConnections();
  return (await getDb().select().from(schema.ledgerConnections).all()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function getConnection(id: string): Promise<ConnectionRow> {
  const c = await getDb().select().from(schema.ledgerConnections).where(eq(schema.ledgerConnections.id, id)).get();
  if (!c) throw new AppError('not_found', `ledger connection ${id} not found`, 404);
  return c;
}

export interface AddConnectionInput {
  kind: LedgerKind;
  name: string;
  mode?: 'fixture' | 'live';
  token?: string;
  config?: ConnectionConfig;
  bankFeedConfirmed?: boolean;
  id?: string;
  by?: string;
}

export async function addConnection(inp: AddConnectionInput): Promise<ConnectionRow> {
  if (!CAPABILITIES[inp.kind]) throw new AppError('bad_kind', `kind must be one of ${Object.keys(CAPABILITIES).join(', ')}`, 400);
  if (!inp.name?.trim()) throw new AppError('bad_name', 'name is required', 400);
  const mode = inp.mode ?? 'fixture';
  if (mode === 'live' && !inp.token) throw new AppError('token_required', `A live ${inp.kind === 'slash' ? 'Slash' : 'Mercury'} connection needs your ${KEY_HELP[inp.kind].label} (${KEY_HELP[inp.kind].where})`, 400);
  if (mode === 'live' && inp.token) await verifyKey(inp.kind, inp.token, inp.config ?? {});
  await ensureDefaultConnections();
  const caps = CAPABILITIES[inp.kind];
  const now = nowIso();
  const row = {
    id: inp.id ?? newId('conn'), kind: inp.kind, name: inp.name.trim(), mode, status: 'inactive' as const,
    configJson: JSON.stringify(inp.config ?? {}), credentialsEnc: inp.token ? encrypt(inp.token) : null,
    capabilitiesJson: JSON.stringify(caps),
    bankFeedConfirmedBy: inp.bankFeedConfirmed ? (inp.by ?? config.reviewer) : null,
    bankFeedConfirmedAt: inp.bankFeedConfirmed ? now : null,
    createdAt: now, updatedAt: now
  };
  await getDb().insert(schema.ledgerConnections).values(row).run();
  adapters.delete(akey(row.id));
  return await getConnection(row.id);
}

export async function updateConnection(id: string, patch: { config?: ConnectionConfig; bankFeedConfirmed?: boolean; name?: string; by?: string; mode?: 'fixture' | 'live'; token?: string }): Promise<ConnectionRow> {
  const c = await getConnection(id);
  const cfg = patch.config ? { ...configOf(c), ...patch.config } : configOf(c);
  if (patch.token) await verifyKey(c.kind as LedgerKind, patch.token, cfg);
  await getDb().update(schema.ledgerConnections).set({
    name: patch.name ?? c.name,
    ...(patch.mode ? { mode: patch.mode } : {}),
    ...(patch.token ? { credentialsEnc: encrypt(patch.token), lastError: null } : {}),
    configJson: patch.config ? JSON.stringify(cfg) : c.configJson,
    ...(patch.bankFeedConfirmed !== undefined ? {
      bankFeedConfirmedBy: patch.bankFeedConfirmed ? (patch.by ?? config.reviewer) : null,
      bankFeedConfirmedAt: patch.bankFeedConfirmed ? nowIso() : null
    } : {}),
    updatedAt: nowIso()
  }).where(eq(schema.ledgerConnections.id, id)).run();
  adapters.delete(akey(id));
  return await getConnection(id);
}

/** Why a connection can't be activated yet (empty = ready). */
export function activationBlockers(c: ConnectionRow): string[] {
  const out: string[] = [];
  const caps = capabilitiesOf(c);
  if (caps.code === 'qbo_direct') {
    if (!c.bankFeedConfirmedAt) out.push(`Confirm that ${c.kind === 'mercury' ? "Mercury's QuickBooks sync and " : ''}the QuickBooks bank feed for these accounts are off or will be matched — otherwise transactions are booked twice`);
    const map = configOf(c).qboBankAccountIdByAccount ?? {};
    if (!Object.keys(map).length) out.push('Map each ledger account to a QuickBooks bank account');
  }
  if (c.mode === 'live' && !c.credentialsEnc && (c.kind === 'mercury' || config.slashMode !== 'live')) out.push(`Add your ${KEY_HELP[c.kind as LedgerKind].label}`);
  return out;
}

export async function setConnectionStatus(id: string, active: boolean): Promise<ConnectionRow> {
  const c = await getConnection(id);
  if (active) {
    const blockers = activationBlockers(c);
    if (blockers.length) throw new AppError('not_ready', blockers.join('; '), 409);
  }
  await getDb().update(schema.ledgerConnections).set({ status: active ? 'active' : 'inactive', updatedAt: nowIso() }).where(eq(schema.ledgerConnections.id, id)).run();
  return await getConnection(id);
}

export async function recordPull(id: string, error: string | null) {
  await getDb().update(schema.ledgerConnections).set({ lastPullAt: nowIso(), lastError: error, updatedAt: nowIso() }).where(eq(schema.ledgerConnections.id, id)).run();
}

// Keyed by org + connection: two companies can both have conn_slash, with different credentials.
const adapters = new Map<string, LedgerAdapter>();
const akey = (connectionId: string) => `${currentOrgId()}:${connectionId}`;


/**
 * Build an adapter. Live connections use their own key (per company, encrypted at rest). A live Slash connection
 * without a key falls back to the server's SLASH_API_KEY only when the server itself runs SLASH_MODE=live (self-host);
 * otherwise it fails loudly rather than silently serving sample data.
 */
export function buildAdapter(kind: LedgerKind, mode: 'fixture' | 'live', token: string | null, cfg: ConnectionConfig): LedgerAdapter {
  const ports = getPorts();
  if (kind === 'slash') {
    if (mode !== 'live') return new SlashAdapter(ports.slash);
    if (token) return new SlashAdapter(new LiveSlash(token, cfg.legalEntityId ?? ''));
    if (config.slashMode === 'live') return new SlashAdapter(ports.slash);
    throw new AppError('key_missing', `Add your ${KEY_HELP.slash.label} (${KEY_HELP.slash.where})`, 409);
  }
  if (kind === 'mercury') {
    if (mode !== 'live') return new MercuryAdapter(ports.mercury, cfg.accountIds ?? []);
    if (!token) throw new AppError('key_missing', `Add your ${KEY_HELP.mercury.label} (${KEY_HELP.mercury.where})`, 409);
    return new MercuryAdapter(new LiveMercury(token), cfg.accountIds ?? []);
  }
  throw new AppError('bad_kind', `no adapter for ${kind}`, 400);
}

/** Check a key against the ledger before it is stored. A rejected key is never saved. */
export async function verifyKey(kind: LedgerKind, token: string, cfg: ConnectionConfig) {
  let health: { ok: boolean; message: string };
  try { health = await buildAdapter(kind, 'live', token, cfg).health(); }
  catch (e) { health = { ok: false, message: (e as Error).message }; }
  if (!health.ok) throw new AppError('key_rejected', `${KEY_HELP[kind].label} was not accepted: ${health.message}. Find it at ${KEY_HELP[kind].where}.`, 422);
}

export async function getAdapter(connectionId: string): Promise<LedgerAdapter> {
  const cached = adapters.get(akey(connectionId));
  if (cached) return cached;
  const c = await getConnection(connectionId);
  const a = buildAdapter(c.kind as LedgerKind, c.mode as 'fixture' | 'live', c.credentialsEnc ? decrypt(c.credentialsEnc) : null, configOf(c));
  adapters.set(akey(connectionId), a);
  return a;
}

/** Tests swap ports; adapters must be rebuilt. */
export function resetAdapters() { adapters.clear(); }

/** Public view (never includes credentials). */
export function connectionView(c: ConnectionRow, counts?: { inReview: number; total: number }) {
  return {
    id: c.id, kind: c.kind, name: c.name, mode: c.mode, status: c.status,
    capabilities: capabilitiesOf(c), config: configOf(c), hasCredentials: !!c.credentialsEnc, keyHelp: KEY_HELP[c.kind as LedgerKind] ?? null,
    bankFeedConfirmedBy: c.bankFeedConfirmedBy, bankFeedConfirmedAt: c.bankFeedConfirmedAt,
    lastPullAt: c.lastPullAt, lastError: c.lastError, blockers: activationBlockers(c),
    inReview: counts?.inReview ?? 0, total: counts?.total ?? 0, createdAt: c.createdAt
  };
}
