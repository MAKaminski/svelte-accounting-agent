import { handle } from '$lib/server/api';
import { removeMember } from '$lib/server/processes/members';
export const POST = handle(({ body, event }) => removeMember(event.params.id!, body.yes));
