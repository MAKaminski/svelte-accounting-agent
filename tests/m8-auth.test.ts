import { describe, it, expect, beforeEach } from 'vitest';
import { setup, asOwner } from './helpers';
import { createOrg } from '../src/lib/server/orgs';
import { getDb, schema, withOrg } from '../src/lib/server/db';
import { signIn, identityForEmail, identityForToken, atLeast, type Identity } from '../src/lib/server/identity';
import { inviteMember, setMemberRole, removeMember, createToken, revokeToken, listMembers, selectOrg } from '../src/lib/server/processes/members';
import { pullEntries } from '../src/lib/server/processes/pull';
import { listEntries } from '../src/lib/server/processes/view';
import { commands } from '../src/lib/commands';
import { POST as approveRoute } from '../src/routes/api/entries/[id]/approve/+server';
import { POST as toggleRoute } from '../src/routes/api/system/components/[id]/state/+server';
import { GET as membersRoute } from '../src/routes/api/members/+server';

type Role = 'owner' | 'reviewer' | 'viewer';
function ev(method: string, routeId: string, body: unknown, params: Record<string, string>, role: Role | null) {
  const url = new URL('http://test/x');
  return { request: new Request(url, { method, body: method === 'GET' ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    route: { id: routeId }, params, url, locals: { user: 'someone@test', role } } as never;
}
const approveAs = async (role: Role | null, id: string) =>
  (await approveRoute(ev('POST', '/api/entries/[id]/approve', { yes: true, later: false }, { id }, role))).status;

/** Sign in as an owner with full cross-org visibility, the way hooks do (owner connection). */
const signInAs = (email: string, name = 'Test') => asOwner(() => signIn({ email, name, sub: `sub-${email}`, emailVerified: true }));
const whois = (email: string) => asOwner(() => identityForEmail(email));

describe('M8 · sign-in, roles, tokens', () => {
  let a: string;
  beforeEach(async () => { a = (await setup()).orgId; });

  it('every registry command declares a role; no write is open to viewers (except switching company)', () => {
    for (const c of commands) {
      expect(['viewer', 'reviewer', 'owner']).toContain(c.role);
      if (c.method === 'POST' && c.name !== 'org.select') expect(c.role).not.toBe('viewer');
    }
    expect(commands.find((c) => c.name === 'entry.approve')!.role).toBe('reviewer');
    expect(commands.find((c) => c.name === 'component.disable')!.role).toBe('owner');
    expect(atLeast('owner', 'reviewer')).toBe(true);
    expect(atLeast('viewer', 'reviewer')).toBe(false);
  });

  it('a Google account with no membership or invite is refused', async () => {
    expect(await signInAs('stranger@gmail.com')).toBe(false);
    expect(await signIn({ email: null })).toBe(false);
    expect(await signIn({ email: 'x@y.com', emailVerified: false })).toBe(false);
  });

  it('an invite is accepted on first sign-in → member with the invited role', async () => {
    const inv = await inviteMember({ email: 'Dana@LaceLuxx.com', role: 'reviewer' });
    expect(inv).toMatchObject({ kind: 'invite', email: 'dana@laceluxx.com', role: 'reviewer' });
    expect(await signInAs('dana@laceluxx.com', 'Dana R.')).toBe(true);
    const id = (await whois('dana@laceluxx.com'))!;
    expect(id.memberships).toEqual([{ orgId: a, orgName: 'Test org', role: 'reviewer' }]);
    const ms = await listMembers();
    expect(ms.find((m) => m.email === 'dana@laceluxx.com')).toMatchObject({ kind: 'member', name: 'Dana R.' });
    await expect(inviteMember({ email: 'dana@laceluxx.com', role: 'viewer' })).rejects.toThrow(/already/);
  });

  it('inviting someone who already uses the app adds them straight away', async () => {
    await inviteMember({ email: 'cpa@example.com', role: 'viewer' });
    await signInAs('cpa@example.com');
    const b = await createOrg('Second company');
    const m = await withOrg(b, () => inviteMember({ email: 'cpa@example.com', role: 'reviewer' }));
    expect(m.kind).toBe('member');
    expect((await whois('cpa@example.com'))!.memberships.map((x) => x.role).sort()).toEqual(['reviewer', 'viewer']);
  });

  it('viewer approve → 403; reviewer approve → 200', async () => {
    await pullEntries({ wait: true });
    const e = (await listEntries()).find((x) => x.state === 'recommended' && x.recommendation?.action === 'code')!;
    expect(await approveAs('viewer', e.id)).toBe(403);
    expect(await approveAs(null, e.id)).toBe(403);
    expect(await approveAs('reviewer', e.id)).toBe(200);
  });

  it('switches and the members list are owner-only', async () => {
    const r = await toggleRoute(ev('POST', '/api/system/components/[id]/state', { enabled: false }, { id: 'AI.entry.recommend' }, 'reviewer'));
    expect(r.status).toBe(403);
    expect((await r.json()).error.message).toMatch(/Owner role needed/);
    expect((await membersRoute(ev('GET', '/api/members', null, {}, 'viewer'))).status).toBe(403);
    expect((await membersRoute(ev('GET', '/api/members', null, {}, 'owner'))).status).toBe(200);
  });

  it("the last owner can't be demoted or removed", async () => {
    await inviteMember({ email: 'boss@laceluxx.com', role: 'owner' });
    await signInAs('boss@laceluxx.com');
    const boss = (await listMembers()).find((m) => m.email === 'boss@laceluxx.com')!;
    await expect(setMemberRole(boss.id, 'viewer')).rejects.toThrow(/last owner/);
    await expect(removeMember(boss.id, true)).rejects.toThrow(/last owner/);
    await expect(removeMember(boss.id, false)).rejects.toThrow(/--yes/);
    await inviteMember({ email: 'second@laceluxx.com', role: 'owner' });
    await signInAs('second@laceluxx.com');
    expect((await setMemberRole(boss.id, 'viewer')).role).toBe('viewer');
  });

  it('a token works for its company, then 401s after revoke; removal kills a member’s tokens', async () => {
    await inviteMember({ email: 'cli@laceluxx.com', role: 'reviewer' });
    await signInAs('cli@laceluxx.com');
    const me = (await whois('cli@laceluxx.com'))! as Identity;
    const t = await createToken('laptop CLI', me);
    expect(t.token).toMatch(/^llx_/);
    const stored = await getDb().select().from(schema.apiTokens);
    expect(JSON.stringify(stored)).not.toContain(t.token); // only the hash is stored
    const viaToken = (await asOwner(() => identityForToken(t.token)))!;
    expect(viaToken).toMatchObject({ email: 'cli@laceluxx.com', token: { id: t.id, orgId: a } });
    expect(await asOwner(() => identityForToken('llx_nope'))).toBeNull();
    await revokeToken(t.id, true);
    expect(await asOwner(() => identityForToken(t.token))).toBeNull();

    const t2 = await createToken('second', me);
    const mem = (await listMembers()).find((m) => m.email === 'cli@laceluxx.com')!;
    await removeMember(mem.id, true);
    expect(await asOwner(() => identityForToken(t2.token))).toBeNull();
  });

  it('a token cannot mint tokens or switch company', async () => {
    await inviteMember({ email: 'tok@laceluxx.com', role: 'owner' });
    await signInAs('tok@laceluxx.com');
    const me = (await whois('tok@laceluxx.com'))!;
    const t = await createToken('ci', me);
    const viaToken = (await asOwner(() => identityForToken(t.token)))!;
    await expect(createToken('another', viaToken)).rejects.toThrow(/web app/);
    expect(() => selectOrg(viaToken, a)).toThrow(/pinned/);
    expect(() => selectOrg(me, 'org_other')).toThrow(/don't belong/);
  });

  it('the audit log records who acted: user id, or token:<id>', async () => {
    await withOrg(a, async () => {
      await toggleRoute(ev('POST', '/api/system/components/[id]/state', { enabled: false }, { id: 'AI.merchant.identify' }, 'owner'));
    }, 'token:tok_abc');
    const rows = await getDb().select().from(schema.auditLog);
    expect(rows.at(-1)).toMatchObject({ actor: 'token:tok_abc', action: 'FE.component.toggle' });
  });
});
