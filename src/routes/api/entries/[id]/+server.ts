import { handle } from '$lib/server/api';
import { getEntry } from '$lib/server/processes/view';
import { AppError } from '$lib/server/util';
export const GET = handle(async ({ event }) => {
  const e = await getEntry(event.params.id!);
  if (!e) throw new AppError('not_found', `entry ${event.params.id} not found`, 404);
  return e;
});
