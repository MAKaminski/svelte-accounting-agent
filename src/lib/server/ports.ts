// Port registry: live vs fixture is a config switch; tests inject their own.
// Ledger adapters are built per connection in ledgers/registry.ts from these ports.
import { config, env } from './env';
import { currentOrgId, getDb, schema } from './db';
import { getProfile } from './profile';
import { AppError } from './util';
import { FixtureSlash } from './slash.fixture';
import { LiveSlash, type SlashPort } from './slash';
import { FixtureQbo, LiveQbo, type QboPort } from './qbo';
import { FixtureQboWriter, LiveQboWriter, type QboWritePort, type QboTxn } from './qbo.write';
import { FixtureMercury, type MercuryPort } from './ledgers/mercury';
import { AnthropicModel, FixtureModel, OllamaModel, type ModelPort } from './ai/model';
import { qboTokenStore } from './qbo.tokens';

export interface Ports {
  slash: SlashPort;
  qbo: QboPort;
  model: ModelPort;
  local: ModelPort | null;
  /** Fixture Mercury used by connections in mode 'fixture'. Live connections build LiveMercury from their own token. */
  mercury: MercuryPort;
  qboWriter: QboWritePort;
}

/**
 * QuickBooks per company (QBO_MODE=live). A company that connected QuickBooks gets its own LiveQbo (own tokens,
 * own cache); a demo company gets sample data; a real company that hasn't connected gets a clear error.
 * QBO_MODE=fixture (tests, local dev): sample data for everyone.
 */
export class OrgQbo implements QboPort {
  readonly mode = 'live' as const;
  private live = new Map<string, LiveQbo>();
  private fixture = new FixtureQbo();
  private fixtureWriter = new FixtureQboWriter();
  private writers = new Map<string, LiveQboWriter>();
  /** Forget a company's client (after reconnecting QuickBooks). */
  reset(orgId: string) { this.live.delete(orgId); this.writers.delete(orgId); }
  async pick(): Promise<{ qbo: QboPort; writer: QboWritePort }> {
    const org = currentOrgId();
    if (await getDb().select({ o: schema.qboTokens.orgId }).from(schema.qboTokens).limit(1).get()) {
      let q = this.live.get(org);
      if (!q) { q = new LiveQbo(qboTokenStore); this.live.set(org, q); }
      let w = this.writers.get(org);
      if (!w) { w = new LiveQboWriter(q); this.writers.set(org, w); }
      return { qbo: q, writer: w };
    }
    if ((await getProfile(org)).sampleData) return { qbo: this.fixture, writer: this.fixtureWriter };
    throw new AppError('qbo_not_connected', 'QuickBooks is not connected for this company — Settings → Connect QuickBooks', 409, 'qbo');
  }
  async connected() {
    return !!(await getDb().select({ o: schema.qboTokens.orgId }).from(schema.qboTokens).limit(1).get());
  }
  async listVendors() { return (await this.pick()).qbo.listVendors(); }
  async purchasesByVendor(vendorId: string) { return (await this.pick()).qbo.purchasesByVendor(vendorId); }
  async listAccounts() { return (await this.pick()).qbo.listAccounts(); }
  /** Writer view over the same per-company routing. */
  writer(): QboWritePort {
    return {
      mode: 'live',
      findCandidates: async (q) => (await this.pick()).writer.findCandidates(q),
      create: async (input, requestId): Promise<QboTxn> => (await this.pick()).writer.create(input, requestId),
      updateLineAccounts: async (txn, lines, requestId) => (await this.pick()).writer.updateLineAccounts(txn, lines, requestId)
    };
  }
}

/** True when this server can run the Intuit OAuth flow (app-level keys from developer.intuit.com). */
export const qboOAuthConfigured = () => !!(env('QBO_CLIENT_ID') && env('QBO_CLIENT_SECRET') && env('QBO_REDIRECT_URI'));

let ports: Ports | null = null;

export function getPorts(): Ports {
  if (!ports) {
    const model = config.modelMode === 'live' ? new AnthropicModel() : new FixtureModel();
    const qbo = config.qboMode === 'live' ? new OrgQbo() : new FixtureQbo();
    ports = {
      slash: config.slashMode === 'live' ? new LiveSlash() : new FixtureSlash(),
      qbo,
      model,
      local: config.ollamaUrl ? new OllamaModel() : null,
      mercury: new FixtureMercury(),
      qboWriter: qbo instanceof OrgQbo ? qbo.writer() : new FixtureQboWriter()
    };
  }
  return ports;
}

export function setPorts(p: Ports | null) { ports = p; }
