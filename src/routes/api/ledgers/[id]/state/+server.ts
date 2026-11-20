import { handle } from '$lib/server/api';
import { setLedgerActive } from '$lib/server/processes/ledgers';
import { AppError } from '$lib/server/util';
export const POST = handle(({ body, event }) => {
  if (typeof body.active !== 'boolean') throw new AppError('bad_request', 'active must be true or false', 400);
  return setLedgerActive(event.params.id!, body.active);
});
