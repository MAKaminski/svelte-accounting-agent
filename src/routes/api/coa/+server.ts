import { handle } from '$lib/server/api';
import { getDb, schema } from '$lib/server/db';
export const GET = handle(() => getDb().select().from(schema.dimensionValues).all().map((d) => ({ id: d.id, name: d.name, enabled: d.enabled })).sort((a, b) => a.name.localeCompare(b.name)));
