// Every process run is logged in `runs` (the audit trail + p95/e2e source).
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { newId, nowIso } from '../util';

export async function withRun<T>(processId: string, subjectId: string | null, fn: (runId: string) => Promise<T>, evalCaseId?: string): Promise<T> {
  const db = getDb();
  const id = newId('run');
  const t0 = Date.now();
  await db.insert(schema.runs).values({ id, processId, subjectId, evalCaseId, startedAt: nowIso(), status: 'running' }).run();
  try {
    const r = await fn(id);
    await db.update(schema.runs).set({ status: 'ok', endedAt: nowIso(), detailJson: JSON.stringify({ e2e_ms: Date.now() - t0 }) }).where(eq(schema.runs.id, id)).run();
    return r;
  } catch (e) {
    const err = e as Error & { code?: string; source?: string };
    await db.update(schema.runs).set({ status: 'failed', endedAt: nowIso(), error: `${err.code ?? 'error'}: ${err.message}`,
      detailJson: JSON.stringify({ e2e_ms: Date.now() - t0, source: err.source }) }).where(eq(schema.runs.id, id)).run();
    throw e;
  }
}
