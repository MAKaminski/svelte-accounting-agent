// In-process scheduler (local single-user app): commit tick 1 s, optional hourly pull, daily COA + backup.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { config, env } from './env';
import { commitDue } from './processes/decide';
import { pullEntries } from './processes/pull';
import { pullCoa } from './processes/coa';
import { getSqlite } from './db';

let started = false;
export function startScheduler() {
  if (started || process.env.VITEST) return;
  started = true;
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await commitDue(); } catch (e) { console.error('[scheduler] commit', (e as Error).message); } finally { busy = false; }
  }, 1000).unref();
  if (config.pullIntervalMin > 0) {
    setInterval(() => pullEntries({ wait: false }).catch((e) => console.error('[scheduler] pull', e.message)), config.pullIntervalMin * 60_000).unref();
  }
  const daily = () => {
    pullCoa().catch((e) => console.error('[scheduler] coa', e.message));
    backup();
  };
  setInterval(daily, 24 * 3600_000).unref();
  setTimeout(backup, 5_000).unref();
}

export function backup() {
  const path = env('DB_PATH', 'data/books.db');
  if (path === ':memory:' || !existsSync(path)) return;
  mkdirSync('data/backups', { recursive: true });
  const dest = `data/backups/books-${new Date().toISOString().slice(0, 10)}.db`;
  if (existsSync(dest)) return;
  getSqlite().pragma('wal_checkpoint(TRUNCATE)');
  copyFileSync(path, dest);
}
