import { handle, str } from '$lib/server/api';
import { listMappings } from '$lib/server/processes/mappings';
export const GET = handle(({ event }) => listMappings(str(event.url.searchParams.get('status'))));
