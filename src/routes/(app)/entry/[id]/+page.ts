import { call, ApiError } from '$lib/client';
import type { EntryDetail } from '$lib/types';

export const load = async ({ fetch, params, depends }) => {
  depends('app:entry');
  try {
    const [entry, accounts] = await Promise.all([
      call<EntryDetail>('entry.show', { id: params.id }, fetch),
      call<{ id: string; name: string; enabled: boolean }[]>('coa.list', {}, fetch)
    ]);
    return { entry, accounts: accounts.filter((a) => a.enabled), error: null };
  } catch (e) {
    const err = e as ApiError;
    return { entry: null, accounts: [], error: { message: err.message, source: err.source ?? 'app' } };
  }
};
