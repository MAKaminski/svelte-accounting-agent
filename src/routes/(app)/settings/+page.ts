import { call, ApiError } from '$lib/client';
type Settings = { slashMode: string; slashKeyPresent: boolean; legalEntityPresent: boolean; qboMode: string; qboConnected: boolean; modelMode: string; modelWorker: string; modelIntegrator: string; ollama: boolean; devBypass: boolean; pullIntervalMin: number; undoWindowMs: number; accounts: number; lastPullAt: string | null };
export const load = async ({ fetch }) => {
  try { return { s: await call<Settings>('settings.show', {}, fetch), error: null }; }
  catch (e) { const err = e as ApiError; return { s: null, error: { message: err.message, source: err.source ?? 'app' } }; }
};
