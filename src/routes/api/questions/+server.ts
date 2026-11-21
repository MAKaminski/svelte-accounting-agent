import { handle, str } from '$lib/server/api';
import { listQuestions } from '$lib/server/processes/questions';
export const GET = handle(({ event }) => listQuestions(str(event.url.searchParams.get('status'))));
