import { handle, bool } from '$lib/server/api';
import { researchEntry } from '$lib/server/processes/research';
import { recommendEntry } from '$lib/server/processes/recommend';
export const POST = handle(async ({ body, event }) => {
  await researchEntry(event.params.id!);
  return recommendEntry(event.params.id!, { force: bool(body.force) });
});
