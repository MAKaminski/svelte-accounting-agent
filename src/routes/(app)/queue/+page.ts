import { call, ApiError } from '$lib/client';
import type { Entry } from '$lib/types';

export const load = async ({ fetch, url, depends }) => {
  depends('app:entries');
  const state = url.searchParams.get('state') ?? 'recommended';
  const connection = url.searchParams.get('connection');
  try {
    const all = await call<Entry[]>('entries.list', {}, fetch);
    return { all, state, connection, error: null };
  } catch (e) {
    const err = e as ApiError;
    return { all: [] as Entry[], state, connection, error: { message: err.message, source: err.source ?? 'app' } };
  }
};
