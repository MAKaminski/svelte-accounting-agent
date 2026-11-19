import { handle, str } from '$lib/server/api';
import { listEntries } from '$lib/server/processes/view';
export const GET = handle(({ event }) => listEntries(str(event.url.searchParams.get('state'))));
