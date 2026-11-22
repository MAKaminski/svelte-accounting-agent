import { call, ApiError } from '$lib/client';
import type { Company } from '$lib/types';
type Settings = { slashMode: string; qboMode: string; qboConnected: boolean; qboOAuth: boolean; signupOpen: boolean; modelMode: string; modelWorker: string; modelIntegrator: string; ollama: boolean; devBypass: boolean; pullIntervalMin: number; undoWindowMs: number; accounts: number; lastPullAt: string | null };
export const load = async ({ fetch, depends }) => {
  depends('app:company');
  try {
    const [s, company] = await Promise.all([call<Settings>('settings.show', {}, fetch), call<Company>('company.show', {}, fetch)]);
    return { s, company, error: null };
  } catch (e) { const err = e as ApiError; return { s: null, company: null, error: { message: err.message, source: err.source ?? 'app' } }; }
};
