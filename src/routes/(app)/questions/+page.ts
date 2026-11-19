import { call, ApiError } from '$lib/client';
import type { Question } from '$lib/types';
export const load = async ({ fetch }) => {
  try { return { questions: await call<Question[]>('questions.list', {}, fetch), error: null }; }
  catch (e) { const err = e as ApiError; return { questions: [] as Question[], error: { message: err.message, source: err.source ?? 'app' } }; }
};
