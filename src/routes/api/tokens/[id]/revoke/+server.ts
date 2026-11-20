import { handle } from '$lib/server/api';
import { revokeToken } from '$lib/server/processes/members';
export const POST = handle(({ body, event }) => revokeToken(event.params.id!, body.yes));
