// Orgs (companies). Until sign-in lands (M8 step 3) the app serves one default org.
import { eq } from 'drizzle-orm';
import { getRootDb, initDb, schema } from './db';

export const DEFAULT_ORG_ID = () => process.env.DEFAULT_ORG_ID ?? 'org_laceluxx';

/** Create the org if missing (owner connection; orgs is a global table). Returns its id. */
export async function ensureOrg(id = DEFAULT_ORG_ID(), name = 'LaceLuxx'): Promise<string> {
  await initDb();
  const db = getRootDb();
  const [row] = await db.select({ id: schema.orgs.id }).from(schema.orgs).where(eq(schema.orgs.id, id));
  if (!row) await db.insert(schema.orgs).values({ id, name, createdAt: new Date().toISOString() }).onConflictDoNothing();
  return id;
}
