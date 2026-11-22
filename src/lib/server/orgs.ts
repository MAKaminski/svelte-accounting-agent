// Orgs (companies). Demo companies come with synthetic data; companies created at sign-up start empty.
import { eq } from 'drizzle-orm';
import { getDb, getRootDb, initDb, schema, withOrg, withRoot } from './db';
import { newId, nowIso, AppError } from './util';
import { ensureDefaultConnections } from './ledgers/registry';
import { DEMO_PROFILE, DEFAULT_CODING_RULES, validateProfile, type CompanyProfile } from './profile';
import { audit } from './audit';
import { seedEvalCases } from './processes/evals';

export const DEFAULT_ORG_ID = () => process.env.DEFAULT_ORG_ID ?? 'org_demo';

/**
 * MW.org.create — a company. Insert as owner (orgs is a global table), then inside the new org's RLS context:
 * the default Slash connection (inactive until configured) and its own copy of the seed eval cases.
 */
export async function createOrg(name: string, id = newId('org'), profile: CompanyProfile = DEMO_PROFILE): Promise<string> {
  if (!name.trim()) throw new AppError('bad_name', 'name is required', 400);
  if (name.trim().length > 120) throw new AppError('bad_name', 'name is at most 120 characters', 400);
  if (!/^org_[A-Za-z0-9_-]+$/.test(id)) throw new AppError('bad_id', 'org id must look like org_<letters, digits, - or _>', 400);
  validateProfile(profile);
  await initDb();
  await withRoot(() => getRootDb().insert(schema.orgs).values({ id, name: name.trim(), profileJson: JSON.stringify(profile), createdAt: nowIso() }).onConflictDoNothing());
  if (profile.sampleData) {
    await withOrg(id, async () => {
      await ensureDefaultConnections();
      await seedEvalCases();
    });
  }
  return id;
}

/**
 * FE.company.create — a signed-in user creates their own company and becomes its owner (self-serve sign-up).
 * Starts empty: no ledger connections, no sample data. Audited inside the new company.
 */
export async function createCompanyForUser(userId: string, inp: { name?: string; business?: string; codingRules?: string }): Promise<{ id: string; name: string }> {
  const name = (inp.name ?? '').trim();
  const business = (inp.business ?? '').trim();
  if (!business) throw new AppError('bad_business', 'Say in a sentence what the company does — the agent uses it to code transactions', 400);
  const id = await createOrg(name, newId('org'), { business, codingRules: inp.codingRules?.trim() || DEFAULT_CODING_RULES, sampleData: false });
  // memberships is a tenant table: write it inside the new company's context (RLS), with the audit row.
  await withOrg(id, async () => {
    await getDb().insert(schema.memberships).values({ id: newId('mem'), orgId: id, userId, role: 'owner', createdAt: nowIso() });
    await audit('FE.company.create', id, { name, business }, userId);
  }, userId);
  return { id, name };
}

/** Create the org if missing. Returns its id. */
export async function ensureOrg(id = DEFAULT_ORG_ID(), name = 'Demo Company'): Promise<string> {
  await initDb();
  const [row] = await getRootDb().select({ id: schema.orgs.id }).from(schema.orgs).where(eq(schema.orgs.id, id));
  return row ? id : createOrg(name, id);
}
