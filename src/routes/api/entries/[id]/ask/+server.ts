import { handle, str } from '$lib/server/api';
import { ask } from '$lib/server/processes/decide';
export const POST = handle(({ body, event }) => ask(event.params.id!, { text: str(body.text) }));
