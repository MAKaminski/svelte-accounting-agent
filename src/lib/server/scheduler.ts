// In-process scheduler (one machine): commit tick 1 s, optional hourly pull, daily COA.
// Every job runs per org, inside that org's RLS context. Backups: Neon point-in-time restore
// plus a weekly pg_dump from CI (see ARCHITECTURE.md → Infrastructure).
import { config } from './env';
import { commitDue } from './processes/decide';
import { pullEntries } from './processes/pull';
import { pullCoa } from './processes/coa';
import { getRootDb, initDb, schema, withOrg } from './db';

let started = false;

/** Run fn once per org, each inside withOrg; one org failing doesn't stop the others. */
export async function forEachOrg(label: string, fn: () => Promise<unknown>) {
  await initDb();
  const orgs = await getRootDb().select({ id: schema.orgs.id }).from(schema.orgs);
  for (const o of orgs) {
    try { await withOrg(o.id, fn); } catch (e) { console.error(`[scheduler] ${label} ${o.id}`, (e as Error).message); }
  }
}

export function startScheduler() {
  if (started || process.env.VITEST) return;
  started = true;
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await forEachOrg('commit', commitDue); } finally { busy = false; }
  }, 1000).unref();
  if (config.pullIntervalMin > 0) {
    setInterval(() => void forEachOrg('pull', () => pullEntries({ wait: false })), config.pullIntervalMin * 60_000).unref();
  }
  setInterval(() => void forEachOrg('coa', pullCoa), 24 * 3600_000).unref();
}
