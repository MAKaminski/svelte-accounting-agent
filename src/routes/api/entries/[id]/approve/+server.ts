import { handle, bool, str } from '$lib/server/api';
import { approve } from '$lib/server/processes/decide';
import { AppError } from '$lib/server/util';
export const POST = handle(({ body, event }) => {
  const dryRun = bool(body.dryRun);
  if (!dryRun && !bool(body.yes)) throw new AppError('confirm_required', 'Approving writes to Slash; pass --yes (or --dry-run)', 400);
  return approve(event.params.id!, { lines: body.lines as never, memo: str(body.memo), override: bool(body.override), later: bool(body.later), dryRun });
});
