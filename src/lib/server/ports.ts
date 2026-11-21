// Port registry: live vs fixture is a config switch; tests inject their own.
// Ledger adapters are built per connection in ledgers/registry.ts from these ports.
import { config } from './env';
import { FixtureSlash } from './slash.fixture';
import { LiveSlash, type SlashPort } from './slash';
import { FixtureQbo, LiveQbo, type QboPort } from './qbo';
import { FixtureQboWriter, LiveQboWriter, type QboWritePort } from './qbo.write';
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

let ports: Ports | null = null;

export function getPorts(): Ports {
  if (!ports) {
    const model = config.modelMode === 'live' ? new AnthropicModel() : new FixtureModel();
    const qbo = config.qboMode === 'live' ? new LiveQbo(qboTokenStore) : new FixtureQbo();
    ports = {
      slash: config.slashMode === 'live' ? new LiveSlash() : new FixtureSlash(),
      qbo,
      model,
      local: config.ollamaUrl ? new OllamaModel() : null,
      mercury: new FixtureMercury(),
      qboWriter: qbo instanceof LiveQbo ? new LiveQboWriter(qbo) : new FixtureQboWriter()
    };
  }
  return ports;
}

export function setPorts(p: Ports | null) { ports = p; }
