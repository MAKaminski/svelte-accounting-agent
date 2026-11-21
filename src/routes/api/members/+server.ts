import { handle } from '$lib/server/api';
import { listMembers } from '$lib/server/processes/members';
export const GET = handle(() => listMembers());
