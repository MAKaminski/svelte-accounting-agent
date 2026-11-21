import { handle } from '$lib/server/api';
import { runEvals } from '$lib/server/processes/evals';
export const POST = handle(() => runEvals());
