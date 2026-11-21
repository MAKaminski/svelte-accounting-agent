import { handle } from '$lib/server/api';
import { listTokens, createToken } from '$lib/server/processes/members';
export const GET = handle(() => listTokens());
export const POST = handle(({ body, event }) => createToken(body.name, event.locals.identity!));
