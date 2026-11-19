import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { config, env } from '../env';
import { getPorts } from '../ports';

export function settings() {
  const db = getDb();
  const lastPull = db.select().from(schema.runs).where(eq(schema.runs.processId, 'MW.entries.pull')).orderBy(desc(schema.runs.startedAt)).limit(1).get();
  let qboConnected = false;
  try { qboConnected = getPorts().qbo.connected(); } catch { /* not configured */ }
  return {
    slashMode: config.slashMode, slashKeyPresent: !!env('SLASH_API_KEY'), legalEntityPresent: !!env('SLASH_LEGAL_ENTITY_ID'),
    qboMode: config.qboMode, qboConnected, modelMode: config.modelMode, modelWorker: config.modelWorker, modelIntegrator: config.modelIntegrator,
    ollama: !!config.ollamaUrl, passcodeSet: !!config.passcode, pullIntervalMin: config.pullIntervalMin, undoWindowMs: config.undoWindowMs,
    accounts: db.select().from(schema.dimensionValues).all().length, lastPullAt: lastPull?.startedAt ?? null
  };
}
