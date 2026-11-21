import { call, ApiError } from '$lib/client';
import type { Component } from '$lib/types';
export const load = async ({ fetch }) => {
  try { return { tools: await call<Component[]>('components.list', { kind: 'tool' }, fetch), error: null }; }
  catch (e) { const err = e as ApiError; return { tools: [] as Component[], error: { message: err.message, source: err.source ?? 'app' } }; }
};
