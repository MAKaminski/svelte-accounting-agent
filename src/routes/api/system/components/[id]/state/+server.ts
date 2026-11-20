import { handle } from '$lib/server/api';
import { setComponentState } from '$lib/server/components';
import { AppError } from '$lib/server/util';
export const POST = handle(async ({ body, event }) => {
  if (typeof body.enabled !== 'boolean') throw new AppError('bad_request', 'enabled must be true or false', 400);
  return await setComponentState(event.params.id!, body.enabled, event.locals.user ?? 'owner');
});
