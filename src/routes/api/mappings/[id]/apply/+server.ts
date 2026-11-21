import { handle, bool } from '$lib/server/api';
import { applyMapping } from '$lib/server/processes/mappings';
import { pullEntries } from '$lib/server/processes/pull';
export const POST = handle(async ({ body, event }) => {
  const r = await applyMapping(event.params.id!, { yes: bool(body.yes), dryRun: bool(body.dryRun) });
  if (!r.dryRun) await pullEntries({ wait: true }); // Slash recoded entries in review: refresh them
  return r;
});
