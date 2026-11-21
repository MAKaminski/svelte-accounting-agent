import { handle } from '$lib/server/api';
import { testLedger } from '$lib/server/processes/ledgers';
export const POST = handle(({ event }) => testLedger(event.params.id!));
