import { handle } from '$lib/server/api';
import { inviteMember } from '$lib/server/processes/members';
export const POST = handle(({ body }) => inviteMember({ email: body.email, role: body.role }));
