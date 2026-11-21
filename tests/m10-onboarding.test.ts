// M10 · company-agnostic onboarding: open sign-up → create company → profile drives the prompt;
// keys are entered per company, checked before saving, never stored when rejected.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setup, asOwner } from './helpers';
import { getDb, schema, withOrg, useSessionOrg } from '../src/lib/server/db';
import { signIn, identityForEmail, pendingIdentity } from '../src/lib/server/identity';
import { createCompanyForUser } from '../src/lib/server/orgs';
import { getProfile, DEFAULT_CODING_RULES } from '../src/lib/server/profile';
import { buildRecommendSystem } from '../src/lib/server/prompts/recommend.v2';
import { showCompany, updateCompany } from '../src/lib/server/processes/company';
import { addConnection, listConnections, updateConnection } from '../src/lib/server/ledgers/registry';
import { OrgQbo } from '../src/lib/server/ports';

const signInAs = (email: string) => asOwner(() => signIn({ email, name: 'New Owner', sub: `sub-${email}`, emailVerified: true }));

describe('M10 · onboarding', () => {
  let demo: string;
  beforeEach(async () => { demo = (await setup()).orgId; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.SIGNUP_MODE; });

  it('open sign-up: any verified Google account signs in, has no company until it creates one, then owns it', async () => {
    expect(await signInAs('founder@newco.test')).toBe(true);
    expect(await asOwner(() => identityForEmail('founder@newco.test'))).toBeNull();
    const pending = (await asOwner(() => pendingIdentity('founder@newco.test')))!;
    expect(pending.memberships).toEqual([]);

    const co = await asOwner(() => createCompanyForUser(pending.userId, { name: 'Newco Plumbing', business: 'Residential plumbing repairs, paid by card on site.' }));
    const id = (await asOwner(() => identityForEmail('founder@newco.test')))!;
    expect(id.memberships).toEqual([{ orgId: co.id, orgName: 'Newco Plumbing', role: 'owner' }]);

    // A real company starts empty: no sample ledger, and its own profile.
    await useSessionOrg(co.id);
    expect(await listConnections()).toEqual([]);
    const p = await getProfile(co.id);
    expect(p).toMatchObject({ business: 'Residential plumbing repairs, paid by card on site.', codingRules: DEFAULT_CODING_RULES, sampleData: false });
    // Audited inside the new company, by the new owner.
    const audit = await getDb().select().from(schema.auditLog);
    expect(audit).toEqual([expect.objectContaining({ action: 'FE.company.create', actor: pending.userId, subject: co.id })]);
    await useSessionOrg(demo);
  });

  it('invite-only mode refuses strangers and gives them no pending identity', async () => {
    process.env.SIGNUP_MODE = 'invite';
    expect(await signInAs('stranger@elsewhere.test')).toBe(false);
    expect(await asOwner(() => pendingIdentity('stranger@elsewhere.test'))).toBeNull();
  });

  it('creating a company needs a business description (the agent depends on it)', async () => {
    await signInAs('lazy@newco.test');
    const p = (await asOwner(() => pendingIdentity('lazy@newco.test')))!;
    await expect(asOwner(() => createCompanyForUser(p.userId, { name: 'X', business: ' ' }))).rejects.toThrow(/what the company does/);
  });

  it('the prompt is company-agnostic: built from the profile, no client name baked in', async () => {
    const sys = buildRecommendSystem([{ id: 'dv_a', name: 'Supplies' }], { name: 'Newco Plumbing', business: 'Residential plumbing repairs.', codingRules: '- Pipe and fittings → Materials' });
    expect(sys).toContain('COMPANY: Newco Plumbing\nResidential plumbing repairs.');
    expect(sys).toContain('- Pipe and fittings → Materials');
    expect(sys).not.toMatch(/laceluxx|whatnot/i);
  });

  it('owners edit the profile; the setup checklist reflects what is done', async () => {
    const c = await showCompany();
    expect(c.sampleData).toBe(true); // the test org predates profiles → demo
    expect(c.setup.map((s) => s.id)).toEqual(['profile', 'ledger', 'qbo', 'accounts', 'first']);
    const u = await updateCompany({ name: 'Renamed Co', business: 'Bakery.', codingRules: '- Flour → Ingredients' });
    expect(u).toMatchObject({ name: 'Renamed Co', business: 'Bakery.', codingRules: '- Flour → Ingredients' });
    await expect(updateCompany({ business: 'x'.repeat(601) })).rejects.toThrow(/at most 600/);
  });

  it('a live key is checked against the ledger before saving; a rejected key is never stored', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"invalid token"}', { status: 401 })));
    await expect(addConnection({ kind: 'mercury', name: 'Mercury', mode: 'live', token: 'bad-token' })).rejects.toThrow(/Mercury API token.*was not accepted.*Settings → Tokens/);
    expect((await listConnections()).filter((c) => c.kind === 'mercury')).toEqual([]);

    const fixture = await addConnection({ kind: 'mercury', name: 'Mercury', mode: 'fixture' });
    await expect(updateConnection(fixture.id, { mode: 'live', token: 'bad-token' })).rejects.toThrow(/not accepted/);
    const after = (await listConnections()).find((c) => c.id === fixture.id)!;
    expect(after).toMatchObject({ mode: 'fixture', credentialsEnc: null });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accounts: [{ id: 'a1', name: 'Checking', status: 'active' }] }), { status: 200 })));
    const ok = await updateConnection(fixture.id, { mode: 'live', token: 'good-token' });
    expect(ok.mode).toBe('live');
    expect(ok.credentialsEnc).toBeTruthy();
    expect(ok.credentialsEnc).not.toContain('good-token');
  });

  it('QuickBooks per company: a real company without a connection gets a clear error, a demo company gets sample data', async () => {
    const qbo = new OrgQbo();
    expect((await qbo.listAccounts()).length).toBeGreaterThan(0); // demo
    await signInAs('qbo@newco.test');
    const p = (await asOwner(() => pendingIdentity('qbo@newco.test')))!;
    const co = await asOwner(() => createCompanyForUser(p.userId, { name: 'Q Co', business: 'Consulting.' }));
    await withOrg(co.id, async () => {
      expect(await qbo.connected()).toBe(false);
      await expect(qbo.listAccounts()).rejects.toThrow(/QuickBooks is not connected for this company/);
    });
  });
});
