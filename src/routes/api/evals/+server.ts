import { handle } from '$lib/server/api';
import { evalSummary } from '$lib/server/processes/evals';
export const GET = handle(() => evalSummary());
