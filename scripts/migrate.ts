// pnpm db:migrate — apply drizzle/ migrations as the owner role.
// DATABASE_URL_OWNER (Neon owner) or DATABASE_URL; default: local PGlite at data/pglite.
import { openDb, resolveDbUrl } from '../src/lib/server/db';
import { env } from '../src/lib/server/env';

env('DATABASE_URL'); // load .env
const url = resolveDbUrl(process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? 'pglite:data/pglite');
const r = await openDb(url, { migrate: true });
await r.close();
console.error(`migrated ${url.startsWith('pglite:') ? url : 'postgres (owner)'}`);
