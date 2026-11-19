// pnpm db:migrate — create data/books.db and apply drizzle/ migrations.
import { openDb } from '../src/lib/server/db';
import { env } from '../src/lib/server/env';
const path = env('DB_PATH', 'data/books.db');
openDb(path).sqlite.close();
console.error(`migrated ${path}`);
