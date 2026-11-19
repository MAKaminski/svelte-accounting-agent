import { handle } from '$lib/server/api';
import { undo } from '$lib/server/processes/decide';
export const POST = handle(({ event }) => undo(event.params.id!));
