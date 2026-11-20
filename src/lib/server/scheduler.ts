// In-process scheduler (one machine): deferred commits on per-org timers, optional hourly pull, daily COA.
// No polling: an idle app sends zero queries, so Neon can scale to zero (a 1 s DB tick would keep
// 0.25 CU awake 730 h/month ≈ 182 CU-h, over the Free plan's 100).
// Every job runs per org, inside that org's RLS context. Backups: Neon point-in-time restore
// plus a weekly pg_dump from CI (see ARCHITECTURE.md → Infrastructure).
import { config } from './env';
import { commitDue } from './processes/decide';
import { pullEntries } from './processes/pull';
import { pullCoa } from './processes/coa';
import { and, inArray, isNotNull, min } from 'drizzle-orm';
import { currentOrgId, getDb, getRootDb, initDb, schema, tryLeaderLock, withOrg, withOrgDetached } from './db';

let started = false;
let leader = false;
const timers = new Map<string, { at: number; t: NodeJS.Timeout }>();

/**
 * Arm (or re-arm) this org's commit timer for its earliest pending undo window. Called after every write
 * (handle()), after each commit run, and once per org at boot. No-op in tests (they call commitDue directly)
 * and on a follower machine.
 */
export async function armCommitTimer(): Promise<void> {
  if (process.env.VITEST || !leader) return;
  const orgId = currentOrgId();
  const [row] = await getDb().select({ at: min(schema.ledgerItems.pendingUntil) }).from(schema.ledgerItems)
    .where(and(inArray(schema.ledgerItems.localState, ['approved', 'coded']), isNotNull(schema.ledgerItems.pendingUntil)));
  const at = row?.at ? Date.parse(row.at) : null;
  const cur = timers.get(orgId);
  if (at === null) { if (cur) { clearTimeout(cur.t); timers.delete(orgId); } return; }
  if (cur && cur.at <= at) return;
  if (cur) clearTimeout(cur.t);
  const t = setTimeout(() => {
    timers.delete(orgId);
    withOrgDetached(orgId, async () => { await commitDue(); await armCommitTimer(); })
      .catch((e) => console.error(`[scheduler] commit ${orgId}`, (e as Error).message));
  }, Math.max(0, at - Date.now()) + 50);
  t.unref();
  timers.set(orgId, { at, t });
}

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
  // Only the advisory-lock holder runs jobs (deploy overlap); a follower retries every 30 s.
  const tryLead = () => tryLeaderLock().then((ok) => {
    if (ok) runJobs();
    else setTimeout(tryLead, 30_000).unref();
  }, (e) => { console.error('[scheduler] leader lock', (e as Error).message); setTimeout(tryLead, 30_000).unref(); });
  void tryLead();
}

function runJobs() {
  leader = true;
  // Recover undo windows that were pending when the process stopped.
  void forEachOrg('commit', async () => { await commitDue(); await armCommitTimer(); });
  if (config.pullIntervalMin > 0) {
    setInterval(() => void forEachOrg('pull', () => pullEntries({ wait: false })), config.pullIntervalMin * 60_000).unref();
  }
  setInterval(() => void forEachOrg('coa', pullCoa), 24 * 3600_000).unref();
}
