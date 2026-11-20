import { call, ApiError } from '$lib/client';
import type { LedgerConnection } from '$lib/types';
export const load = async ({ fetch, depends }) => {
  depends('app:ledgers');
  try { return { ledgers: await call<LedgerConnection[]>('ledgers.list', {}, fetch), error: null }; }
  catch (e) { const err = e as ApiError; return { ledgers: [] as LedgerConnection[], error: { message: err.message, source: err.source ?? 'app' } }; }
};
