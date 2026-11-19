import { handle, str } from '$lib/server/api';
import { importPayouts } from '$lib/server/processes/payouts';
import { AppError } from '$lib/server/util';
// Body: { file: <CSV text>, channel? }. The CLI reads the file and sends its contents.
export const POST = handle(({ body }) => {
  const csv = str(body.file);
  if (!csv) throw new AppError('no_file', 'Send the CSV text as "file"', 400);
  return importPayouts(csv, str(body.channel) ?? 'whatnot', { wait: true });
});
