import { handle } from '$lib/server/api';
import { whoami } from '$lib/server/processes/members';
import { devBypass } from '$lib/server/identity';
export const GET = handle(({ event }) => whoami(event.locals.identity!, event.locals.identity!.token ? 'token' : devBypass() ? 'dev-bypass' : 'google'));
