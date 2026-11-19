import { handle, bool, str } from '$lib/server/api';
import { reject } from '$lib/server/processes/decide';
export const POST = handle(({ body, event }) => reject(event.params.id!, { reason: str(body.reason), yes: bool(body.yes) }));
