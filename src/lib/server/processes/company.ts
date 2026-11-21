// FE.company.create / FE.company.update — the company profile and the setup checklist a new owner follows.
import { getDb, schema, currentOrgId } from '../db';
import { getProfile, updateProfile } from '../profile';
import { createCompanyForUser } from '../orgs';
import { getPorts } from '../ports';
import { listConnections } from '../ledgers/registry';
import type { Company } from '$lib/types';

/** The five steps from sign-up to the first approved entry. Demo companies come with steps 2–4 done. */
async function setupSteps(sampleData: boolean, business: string): Promise<Company['setup']> {
  const db = getDb();
  const conns = await listConnections();
  const keyed = conns.some((c) => c.mode === 'live' && !!c.credentialsEnc);
  let qbo = false;
  try { qbo = await getPorts().qbo.connected(); } catch { /* not configured */ }
  const accounts = !!(await db.select({ id: schema.dimensionValues.id }).from(schema.dimensionValues).limit(1).get());
  const decided = !!(await db.select({ id: schema.decisions.id }).from(schema.decisions).limit(1).get());
  return [
    { id: 'profile', label: 'Describe your company', done: !!business.trim(), href: '/settings#company' },
    { id: 'ledger', label: 'Connect Slash or Mercury with its API key', done: sampleData || keyed, href: '/ledgers' },
    { id: 'qbo', label: 'Connect QuickBooks', done: sampleData || qbo, href: '/settings#quickbooks' },
    { id: 'accounts', label: 'Pull your chart of accounts', done: accounts, href: '/settings#quickbooks' },
    { id: 'first', label: 'Pull transactions and approve your first entry', done: decided, href: '/queue' }
  ];
}

export async function showCompany(): Promise<Company> {
  const id = currentOrgId();
  const p = await getProfile(id);
  return { id, name: p.name, business: p.business, codingRules: p.codingRules, sampleData: p.sampleData, setup: await setupSteps(p.sampleData, p.business) };
}

export async function updateCompany(patch: { name?: string; business?: string; codingRules?: string }): Promise<Company> {
  await updateProfile(currentOrgId(), patch);
  return showCompany();
}

/** Returns the bare company; the caller switches the session to it (cookie) and lands on the checklist. */
export async function createCompany(userId: string, inp: { name?: string; business?: string }) {
  return createCompanyForUser(userId, inp);
}
