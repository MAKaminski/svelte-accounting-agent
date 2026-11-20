import { handle } from '$lib/server/api';
import { listOrgs } from '$lib/server/processes/members';
export const GET = handle(({ event }) => listOrgs(event.locals.identity!));
