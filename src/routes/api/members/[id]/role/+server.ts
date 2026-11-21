import { handle } from '$lib/server/api';
import { setMemberRole } from '$lib/server/processes/members';
export const POST = handle(({ body, event }) => setMemberRole(event.params.id!, body.role));
