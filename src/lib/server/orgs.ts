// Orgs (companies). Until sign-in lands (M8 step 3) the app serves one default org.
import { eq } from 'drizzle-orm';
import { getRootDb, initDb, schema, withOrg } from './db';
import { newId, nowIso, AppError } from './util';
import { ensureDefaultConnections } from './ledgers/registry';
import { seedEvalCases } from './processes/evals';

export const DEFAULT_ORG_ID = () => process.env.DEFAULT_ORG_ID ?? 'org_laceluxx';

/**
 * MW.org.create — a company. Insert as owner (orgs is a global table), then inside the new org's RLS context:
 * the default Slash connection (inactive until configured) and its own copy of the seed eval cases.
 */
export async function createOrg(name: string, id = newId('org')): Promise<string> {
  if (!name.trim()) throw new AppError('bad_name', 'name is required', 400);
  if (!/^org_[A-Za-z0-9_-]+$/.test(id)) throw new AppError('bad_id', 'org id must look like org_<letters, digits, - or _>', 400);
  await initDb();
  await getRootDb().insert(schema.orgs).values({ id, name: name.trim(), createdAt: nowIso() }).onConflictDoNothing();
  await withOrg(id, async () => {
    await ensureDefaultConnections();
    await seedEvalCases();
  });
  return id;
}

/** Create the org if missing. Returns its id. */
export async function ensureOrg(id = DEFAULT_ORG_ID(), name = 'LaceLuxx'): Promise<string> {
  await initDb();
  const [row] = await getRootDb().select({ id: schema.orgs.id }).from(schema.orgs).where(eq(schema.orgs.id, id));
  return row ? id : createOrg(name, id);
}
