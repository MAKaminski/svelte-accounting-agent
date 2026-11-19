// One place that reads configuration. SvelteKit loads .env in dev; scripts load it via dotenv-style below.
import { readFileSync, existsSync } from 'node:fs';

let loaded = false;
function loadDotEnv() {
  if (loaded) return;
  loaded = true;
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function env(name: string, fallback = ''): string {
  loadDotEnv();
  return process.env[name] ?? fallback;
}

export const config = {
  get slashMode() { return env('SLASH_MODE', 'fixture') as 'fixture' | 'live'; },
  get qboMode() { return env('QBO_MODE', 'fixture') as 'fixture' | 'live'; },
  get modelMode() { return env('MODEL_MODE', 'fixture') as 'fixture' | 'live'; },
  get modelWorker() { return env('MODEL_WORKER', 'claude-haiku-5-5'); },
  get modelIntegrator() { return env('MODEL_INTEGRATOR', 'claude-sonnet-5-5'); },
  get ollamaUrl() { return env('OLLAMA_URL'); },
  get passcode() { return env('APP_PASSCODE'); },
  get pullIntervalMin() { return Number(env('PULL_INTERVAL_MIN', '0')) || 0; },
  get undoWindowMs() { return Number(env('UNDO_WINDOW_MS', '10000')); },
  get shadowThreshold() { return Number(env('SHADOW_THRESHOLD', '0.9')); },
  get reviewer() { return env('REVIEWER', 'owner'); }
};
