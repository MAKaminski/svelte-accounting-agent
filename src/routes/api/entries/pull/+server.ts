import { handle, bool, str } from '$lib/server/api';
import { pullEntries } from '$lib/server/processes/pull';
export const POST = handle(({ body }) => pullEntries({ since: str(body.since), dryRun: bool(body.dryRun), wait: body.wait === undefined ? true : bool(body.wait) }));
