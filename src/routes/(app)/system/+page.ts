import { call, ApiError } from '$lib/client';
import type { Component, SystemGraph } from '$lib/types';

export const load = async ({ fetch, url }) => {
  try {
    const [graph, components] = await Promise.all([
      call<SystemGraph>('system.graph', {}, fetch),
      call<Component[]>('components.list', {}, fetch)
    ]);
    return { graph, components, selected: url.searchParams.get('c'), error: null };
  } catch (e) {
    const err = e as ApiError;
    return { graph: null, components: [] as Component[], selected: null, error: { message: err.message, source: err.source ?? 'app' } };
  }
};
