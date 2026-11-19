import { handle } from '$lib/server/api';
import { componentDetail } from '$lib/server/components';
export const GET = handle(({ event }) => componentDetail(event.params.id!));
