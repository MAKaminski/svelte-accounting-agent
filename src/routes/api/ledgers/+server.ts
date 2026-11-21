import { handle, bool, str } from '$lib/server/api';
import { listLedgers, addLedger } from '$lib/server/processes/ledgers';
export const GET = handle(() => listLedgers());
export const POST = handle(({ body, event }) => addLedger({
  kind: str(body.kind), name: str(body.name), mode: str(body.mode), token: str(body.token), qboBank: str(body.qboBank),
  confirmBankFeed: bool(body.confirmBankFeed), by: event.locals.user ?? undefined, legalEntity: str(body.legalEntity)
}));
