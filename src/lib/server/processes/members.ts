// Members, invites, API tokens and company switching. Everything here runs inside the current org's RLS
// context (getDb), so an owner can only ever see and change their own company's people and tokens.
import { and, asc, eq, isNull } from 'drizzle-orm';
import { currentOrgId, currentUserId, getDb, schema } from '../db';
import { AppError, newId, nowIso } from '../util';
import { mintToken, normEmail, type Identity, type Role } from '../identity';
import type { ApiToken, Member, Org, Whoami } from '$lib/types';

const ROLES: Role[] = ['owner', 'reviewer', 'viewer'];
function asRole(v: unknown): Role {
  if (!ROLES.includes(v as Role)) throw new AppError('bad_role', 'role must be owner, reviewer or viewer', 400);
  return v as Role;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** FE.members.list — members (with last seen) and pending invites. */
export async function listMembers(): Promise<Member[]> {
  const db = getDb();
  const me = currentUserId();
  const rows = await db.select({ m: schema.memberships, u: schema.users }).from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).orderBy(asc(schema.users.email));
  const inv = await db.select().from(schema.invites).where(isNull(schema.invites.acceptedAt)).orderBy(asc(schema.invites.email));
  return [
    ...rows.map(({ m, u }) => ({ id: m.id, kind: 'member' as const, email: u.email, name: u.name, role: m.role, lastSeenAt: u.lastSeenAt, createdAt: m.createdAt, you: u.id === me })),
    ...inv.map((i) => ({ id: i.id, kind: 'invite' as const, email: i.email, name: null, role: i.role, lastSeenAt: null, createdAt: i.createdAt, you: false }))
  ];
}

async function memberView(id: string): Promise<Member> {
  const m = (await listMembers()).find((x) => x.id === id);
  if (!m) throw new AppError('not_found', `member ${id} not found`, 404);
  return m;
}

/**
 * FE.member.invite — an open invite for this company. If the Google account has already signed in to the app
 * (another company), the membership is created straight away; otherwise it is accepted on first sign-in.
 */
export async function inviteMember(inp: { email?: unknown; role?: unknown }): Promise<Member> {
  if (typeof inp.email !== 'string' || !EMAIL.test(inp.email.trim())) throw new AppError('bad_email', 'a valid email is required', 400);
  const email = normEmail(inp.email);
  const role = asRole(inp.role);
  const db = getDb();
  if ((await listMembers()).some((m) => m.email === email)) throw new AppError('already_member', `${email} is already a member or invited`, 409);
  // users is global (no RLS): look up by exact email only.
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const now = nowIso();
  if (u) {
    const id = newId('mem');
    await db.insert(schema.memberships).values({ id, userId: u.id, role, createdAt: now });
    await db.insert(schema.invites).values({ id: newId('inv'), email, role, invitedBy: realUser(), createdAt: now, acceptedAt: now });
    return memberView(id);
  }
  const id = newId('inv');
  await db.insert(schema.invites).values({ id, email, role, invitedBy: realUser(), createdAt: now });
  return memberView(id);
}

/** Token actors (token:<id>) aren't users; invited_by references users. */
function realUser(): string | null {
  const a = currentUserId();
  return a && !a.startsWith('token:') ? a : null;
}

async function ownerCount() {
  return (await getDb().select().from(schema.memberships).where(eq(schema.memberships.role, 'owner'))).length;
}

/** FE.member.role — change a role; the company always keeps at least one owner. */
export async function setMemberRole(id: string, roleIn: unknown): Promise<Member> {
  const role = asRole(roleIn);
  const db = getDb();
  if (id.startsWith('inv_')) {
    const r = await db.update(schema.invites).set({ role }).where(and(eq(schema.invites.id, id), isNull(schema.invites.acceptedAt))).returning();
    if (!r.length) throw new AppError('not_found', `invite ${id} not found`, 404);
    return memberView(id);
  }
  const [m] = await db.select().from(schema.memberships).where(eq(schema.memberships.id, id));
  if (!m) throw new AppError('not_found', `member ${id} not found`, 404);
  if (m.role === 'owner' && role !== 'owner' && (await ownerCount()) <= 1) throw new AppError('last_owner', "The last owner can't be demoted; make someone else owner first", 409);
  await db.update(schema.memberships).set({ role }).where(eq(schema.memberships.id, id));
  return memberView(id);
}

/** FE.member.remove — remove a member (their tokens for this company stop working) or cancel an invite. */
export async function removeMember(id: string, yes: unknown): Promise<Member> {
  if (yes !== true) throw new AppError('confirm_required', 'pass --yes to confirm', 400);
  const db = getDb();
  const before = await memberView(id);
  if (before.kind === 'invite') {
    await db.delete(schema.invites).where(eq(schema.invites.id, id));
    return before;
  }
  if (before.role === 'owner' && (await ownerCount()) <= 1) throw new AppError('last_owner', "The last owner can't be removed", 409);
  const [m] = await db.select().from(schema.memberships).where(eq(schema.memberships.id, id));
  await db.update(schema.apiTokens).set({ revokedAt: nowIso() }).where(and(eq(schema.apiTokens.userId, m.userId), isNull(schema.apiTokens.revokedAt)));
  await db.delete(schema.memberships).where(eq(schema.memberships.id, id));
  return before;
}

// ---------- tokens ----------

function tokenView(t: typeof schema.apiTokens.$inferSelect, email: string): ApiToken {
  return { id: t.id, name: t.name, userEmail: email, lastUsedAt: t.lastUsedAt, revokedAt: t.revokedAt, createdAt: t.createdAt };
}

/** FE.tokens.list */
export async function listTokens(): Promise<ApiToken[]> {
  const rows = await getDb().select({ t: schema.apiTokens, email: schema.users.email }).from(schema.apiTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiTokens.userId)).orderBy(asc(schema.apiTokens.createdAt));
  return rows.map((r) => tokenView(r.t, r.email));
}

/** FE.token.create — for the calling user in the current company. Raw token returned once; only its sha256 is stored. */
export async function createToken(name: unknown, identity: Identity): Promise<ApiToken & { token: string }> {
  if (typeof name !== 'string' || !name.trim()) throw new AppError('bad_name', 'name is required', 400);
  if (identity.token) throw new AppError('forbidden', 'Create tokens from the web app, not with another token', 403);
  const { raw, hash } = mintToken();
  const row = { id: newId('tok'), userId: identity.userId, name: name.trim().slice(0, 80), tokenHash: hash, createdAt: nowIso() };
  await getDb().insert(schema.apiTokens).values(row);
  const [t] = await getDb().select().from(schema.apiTokens).where(eq(schema.apiTokens.id, row.id));
  return { ...tokenView(t, identity.email), token: raw };
}

/** FE.token.revoke — immediate: the next request with it gets 401. */
export async function revokeToken(id: string, yes: unknown): Promise<ApiToken> {
  if (yes !== true) throw new AppError('confirm_required', 'pass --yes to confirm', 400);
  const r = await getDb().update(schema.apiTokens).set({ revokedAt: nowIso() }).where(eq(schema.apiTokens.id, id)).returning();
  if (!r.length) throw new AppError('not_found', `token ${id} not found`, 404);
  return (await listTokens()).find((t) => t.id === id)!;
}

// ---------- companies ----------

/** FE.orgs.list — the caller's companies (from the identity resolved in hooks; no tenant query). */
export function listOrgs(identity: Identity): Org[] {
  const cur = currentOrgId();
  return identity.memberships.map((m) => ({ id: m.orgId, name: m.orgName, role: m.role, current: m.orgId === cur }));
}

/** FE.org.select — validate membership; the route sets the books_org cookie. Tokens are pinned to their company. */
export function selectOrg(identity: Identity, orgId: string): Org {
  if (identity.token) throw new AppError('forbidden', 'API tokens are pinned to one company', 403);
  const m = identity.memberships.find((x) => x.orgId === orgId);
  if (!m) throw new AppError('not_found', `You don't belong to ${orgId}`, 404);
  return { id: m.orgId, name: m.orgName, role: m.role, current: true };
}

/** FE.auth.whoami */
export function whoami(identity: Identity, via: Whoami['via']): Whoami {
  const cur = currentOrgId();
  const m = identity.memberships.find((x) => x.orgId === cur)!;
  return { email: identity.email, name: identity.name, orgId: m.orgId, orgName: m.orgName, role: m.role, via };
}

