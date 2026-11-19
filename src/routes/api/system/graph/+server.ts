import { handle } from '$lib/server/api';
import { systemGraph } from '$lib/server/components';
export const GET = handle(() => systemGraph());
