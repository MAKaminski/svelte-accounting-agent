import { devBypass, signupOpen } from '../identity';
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { config, env } from '../env';
import { getPorts, qboOAuthConfigured } from '../ports';

export async function settings() {
  const db = getDb();
  const lastPull = await db.select().from(schema.runs).where(eq(schema.runs.processId, 'MW.ledger.pull')).orderBy(desc(schema.runs.startedAt)).limit(1).get();
  let qboConnected = false;
  try { qboConnected = await getPorts().qbo.connected(); } catch { /* not configured */ }
  return {
    slashMode: config.slashMode, slashKeyPresent: !!env('SLASH_API_KEY'), legalEntityPresent: !!env('SLASH_LEGAL_ENTITY_ID'),
    qboMode: config.qboMode, qboConnected, qboOAuth: qboOAuthConfigured(), modelMode: config.modelMode, modelWorker: config.modelWorker, modelIntegrator: config.modelIntegrator,
    ollama: !!config.ollamaUrl, devBypass: devBypass(), signupOpen: signupOpen(), pullIntervalMin: config.pullIntervalMin, undoWindowMs: config.undoWindowMs,
    accounts: (await db.select().from(schema.dimensionValues).all()).length, lastPullAt: lastPull?.startedAt ?? null
  };
}
