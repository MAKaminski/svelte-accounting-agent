import { handle, str } from '$lib/server/api';
import { addEvalFromEntry } from '$lib/server/processes/evals';
import { AppError } from '$lib/server/util';
export const POST = handle(({ body }) => {
  const entry = str(body.entry);
  if (!entry) throw new AppError('no_entry', 'entry is required', 400);
  return addEvalFromEntry(entry);
});
