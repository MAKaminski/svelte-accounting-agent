import { handle } from '$lib/server/api';
import { settings } from '$lib/server/processes/settings';
export const GET = handle(() => settings());
