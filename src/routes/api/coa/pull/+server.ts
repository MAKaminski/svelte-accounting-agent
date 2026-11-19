import { handle, bool } from '$lib/server/api';
import { pullCoa } from '$lib/server/processes/coa';
export const POST = handle(({ body }) => pullCoa({ dryRun: bool(body.dryRun) }));
