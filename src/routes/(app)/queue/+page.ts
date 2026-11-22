import { call, ApiError } from '$lib/client';
import type { Entry, Company } from '$lib/types';

export const load = async ({ fetch, url, depends }) => {
  depends('app:entries');
  const state = url.searchParams.get('state') ?? 'recommended';
  const connection = url.searchParams.get('connection');
  try {
    const [all, company] = await Promise.all([call<Entry[]>('entries.list', {}, fetch), call<Company>('company.show', {}, fetch).catch(() => null)]);
    return { all, state, connection, company, error: null };
  } catch (e) {
    const err = e as ApiError;
    return { all: [] as Entry[], state, connection, company: null as Company | null, error: { message: err.message, source: err.source ?? 'app' } };
  }
};
