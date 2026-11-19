import { call, ApiError } from '$lib/client';
import type { MappingProposal } from '$lib/types';
export const load = async ({ fetch }) => {
  try { return { mappings: await call<MappingProposal[]>('mappings.list', {}, fetch), error: null }; }
  catch (e) { const err = e as ApiError; return { mappings: [] as MappingProposal[], error: { message: err.message, source: err.source ?? 'app' } }; }
};
