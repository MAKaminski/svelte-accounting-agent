import { handle, str } from '$lib/server/api';
import { listEntries } from '$lib/server/processes/view';
export const GET = handle(async ({ event }) => {
  const conn = str(event.url.searchParams.get('connection'));
  const rows = await listEntries(str(event.url.searchParams.get('state')));
  return conn ? rows.filter((e) => e.connectionId === conn) : rows;
});
