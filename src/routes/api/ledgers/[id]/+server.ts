import { handle } from '$lib/server/api';
import { showLedger } from '$lib/server/processes/ledgers';
export const GET = handle(({ event }) => showLedger(event.params.id!));
