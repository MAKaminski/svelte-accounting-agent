// pnpm db:reset — drop the local PGlite database directory and re-migrate.
// Refuses anything but a local pglite:data/<name> URL (never touches Neon or paths outside data/).
import { rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { openDb } from '../src/lib/server/db';

const url = process.env.DATABASE_URL ?? 'pglite:data/pglite';
const m = /^pglite:(data\/[a-z0-9_-]+)$/i.exec(url);
if (!m) { console.error(`db:reset only resets a local pglite:data/<name> database (got ${url.startsWith('pglite:') ? url : 'a postgres URL'})`); process.exit(1); }
const dir = resolve(m[1]);
if (!dir.startsWith(resolve('data') + sep)) { console.error('refusing to delete outside data/'); process.exit(1); }
rmSync(dir, { recursive: true, force: true });
const r = await openDb(url, { migrate: true });
await r.close();
console.error(`reset ${m[1]}`);
