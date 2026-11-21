import { call, ApiError } from '$lib/client';
import type { Component } from '$lib/types';
export const load = async ({ fetch }) => {
  try { return { components: (await call<Component[]>('components.list', {}, fetch)).filter((c) => c.kind !== 'tool'), error: null }; }
  catch (e) { const err = e as ApiError; return { components: [] as Component[], error: { message: err.message, source: err.source ?? 'app' } }; }
};
