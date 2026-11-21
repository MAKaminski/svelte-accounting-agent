import { handle, str } from '$lib/server/api';
import { listComponents } from '$lib/server/components';
import type { Component } from '$lib/types';
export const GET = handle(({ event }) => listComponents(str(event.url.searchParams.get('kind')) as Component['kind'] | undefined));
