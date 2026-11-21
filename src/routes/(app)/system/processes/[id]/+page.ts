import { call, ApiError } from '$lib/client';
import type { ComponentDetail } from '$lib/types';
export const load = async ({ fetch, params }) => {
  try { return { c: await call<ComponentDetail>('component.show', { id: params.id }, fetch), error: null }; }
  catch (e) { const err = e as ApiError; return { c: null, error: { message: err.message, source: err.source ?? 'app' } }; }
};
