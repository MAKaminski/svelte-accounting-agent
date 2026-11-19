// Port registry: live vs fixture is a config switch; tests inject their own.
import { config } from './env';
import { FixtureSlash } from './slash.fixture';
import { LiveSlash, type SlashPort } from './slash';
import { FixtureQbo, LiveQbo, type QboPort } from './qbo';
import { AnthropicModel, FixtureModel, OllamaModel, type ModelPort } from './ai/model';
import { qboTokenStore } from './qbo.tokens';

export interface Ports { slash: SlashPort; qbo: QboPort; model: ModelPort; local: ModelPort | null }

let ports: Ports | null = null;

export function getPorts(): Ports {
  if (!ports) {
    const model = config.modelMode === 'live' ? new AnthropicModel() : new FixtureModel();
    ports = {
      slash: config.slashMode === 'live' ? new LiveSlash() : new FixtureSlash(),
      qbo: config.qboMode === 'live' ? new LiveQbo(qboTokenStore) : new FixtureQbo(),
      model,
      local: config.ollamaUrl ? new OllamaModel() : null
    };
  }
  return ports;
}

export function setPorts(p: Ports | null) { ports = p; }
