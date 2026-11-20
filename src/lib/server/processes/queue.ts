// Tiny in-process job queue with bounded concurrency. Tests and `--wait` callers await drain().
// A job runs in the org context it was enqueued from (RLS), never in whatever context pump() happens to be in.
import { currentOrgId, currentUserId, hasOrgContext, withOrgDetached } from '../db';
type Job = () => Promise<unknown>;
const pending: Job[] = [];
let active = 0;
const CONCURRENCY = 4;
let waiters: (() => void)[] = [];

export function enqueue(job: Job) {
  if (hasOrgContext()) {
    const orgId = currentOrgId(), userId = currentUserId();
    pending.push(() => withOrgDetached(orgId, job, userId));
  } else pending.push(job);
  pump();
}

function pump() {
  while (active < CONCURRENCY && pending.length) {
    const job = pending.shift()!;
    active++;
    job().catch((e) => console.error('[queue] job failed:', (e as Error).message)).finally(() => {
      active--;
      if (!active && !pending.length) { const w = waiters; waiters = []; w.forEach((f) => f()); }
      pump();
    });
  }
}

export function drain(): Promise<void> {
  if (!active && !pending.length) return Promise.resolve();
  return new Promise((r) => waiters.push(r));
}
