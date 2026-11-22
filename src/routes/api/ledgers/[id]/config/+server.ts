import { handle, str } from '$lib/server/api';
import { configureLedger } from '$lib/server/processes/ledgers';
export const POST = handle(({ body, event }) => configureLedger(event.params.id!, {
  qboBank: str(body.qboBank), confirmBankFeed: typeof body.confirmBankFeed === 'boolean' ? body.confirmBankFeed : undefined, by: event.locals.user ?? undefined,
  mode: str(body.mode), token: str(body.token), legalEntity: typeof body.legalEntity === 'string' ? body.legalEntity : undefined
}));
