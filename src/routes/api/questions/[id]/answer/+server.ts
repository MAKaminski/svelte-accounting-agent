import { handle, bool, str } from '$lib/server/api';
import { answerQuestion } from '$lib/server/processes/questions';
export const POST = handle(({ body, event }) => answerQuestion(event.params.id!, str(body.text) ?? '', { wait: bool(body.wait) }));
