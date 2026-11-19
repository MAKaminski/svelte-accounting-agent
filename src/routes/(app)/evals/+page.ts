import { call, ApiError } from '$lib/client';
import type { EvalRun } from '$lib/types';
type Summary = { lastRun: EvalRun | null; shadow: { decisions: number; agreed: number; precision: number | null; autoApproveWouldHave: number; autoApprovePrecision: number | null }; costByWeek: { week: string; calls: number; costUsd: number; cacheReadShare: number | null }[]; cases: { id: string; kind: string; name: string }[] };
export const load = async ({ fetch }) => {
  try { return { summary: await call<Summary>('evals.show', {}, fetch), error: null }; }
  catch (e) { const err = e as ApiError; return { summary: null, error: { message: err.message, source: err.source ?? 'app' } }; }
};
