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

/** First run: the Slash connection the app has always had (mode follows SLASH_MODE). */
export async function ensureDefaultConnections() {
  const db = getDb();
  if (await db.select().from(schema.ledgerConnections).limit(1).get()) return;
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
  if (inp.kind === 'mercury' && mode === 'live' && !inp.token) throw new AppError('token_required', 'A live Mercury connection needs a token (read-only is enough)', 400);
  if (inp.kind === 'slash' && mode === 'live' && !inp.token) throw new AppError('token_required', 'A live Slash connection needs an API key (Slash dashboard → Settings → Developer)', 400);
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

export async function updateConnection(id: string, patch: { config?: ConnectionConfig; bankFeedConfirmed?: boolean; name?: string; by?: string }): Promise<ConnectionRow> {
  const c = await getConnection(id);
  await getDb().update(schema.ledgerConnections).set({
    name: patch.name ?? c.name,
    configJson: patch.config ? JSON.stringify({ ...configOf(c), ...patch.config }) : c.configJson,
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
  if (c.mode === 'live' && c.kind === 'mercury' && !c.credentialsEnc) out.push('Add a Mercury token');
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

export async function getAdapter(connectionId: string): Promise<LedgerAdapter> {
  const cached = adapters.get(akey(connectionId));
  if (cached) return cached;
  const c = await getConnection(connectionId);
  const ports = getPorts();
  let a: LedgerAdapter;
  // Live Slash: the connection's own encrypted key (per org). Without one, the app-level port (fixture, or env key locally).
  if (c.kind === 'slash') a = new SlashAdapter(c.mode === 'live' && c.credentialsEnc ? new LiveSlash(decrypt(c.credentialsEnc), configOf(c).legalEntityId ?? '') : ports.slash);
  else if (c.kind === 'mercury') {
    const port = c.mode === 'live' ? new LiveMercury(decrypt(c.credentialsEnc!)) : ports.mercury;
    a = new MercuryAdapter(port, configOf(c).accountIds ?? []);
  } else throw new AppError('bad_kind', `no adapter for ${c.kind}`, 400);
  adapters.set(akey(connectionId), a);
  return a;
}

/** Tests swap ports; adapters must be rebuilt. */
export function resetAdapters() { adapters.clear(); }

/** Public view (never includes credentials). */
export function connectionView(c: ConnectionRow, counts?: { inReview: number; total: number }) {
  return {
    id: c.id, kind: c.kind, name: c.name, mode: c.mode, status: c.status,
    capabilities: capabilitiesOf(c), config: configOf(c), hasCredentials: !!c.credentialsEnc,
    bankFeedConfirmedBy: c.bankFeedConfirmedBy, bankFeedConfirmedAt: c.bankFeedConfirmedAt,
    lastPullAt: c.lastPullAt, lastError: c.lastError, blockers: activationBlockers(c),
    inReview: counts?.inReview ?? 0, total: counts?.total ?? 0, createdAt: c.createdAt
  };
}
