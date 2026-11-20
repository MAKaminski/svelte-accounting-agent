// Who is calling, and in which company with which role. Runs before any org context exists, so it uses the
// owner connection (getRootDb) — only for users, memberships, invites and token lookups.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { getRootDb, initDb, schema } from './db';
import { newId, nowIso, AppError } from './util';
import { env } from './env';
import type { Role } from './db/schema';
import { DEFAULT_ORG_ID, ensureOrg } from './orgs';

export type { Role };
export interface Membership { orgId: string; orgName: string; role: Role }
export interface Identity {
  userId: string;
  email: string;
  name: string | null;
  memberships: Membership[];
  /** Set when the caller authenticated with an API token: the token's own org (no switching). */
  token?: { id: string; orgId: string };
}

const RANK: Record<Role, number> = { viewer: 0, reviewer: 1, owner: 2 };
export const atLeast = (have: Role | null | undefined, need: Role) => !!have && RANK[have] >= RANK[need];
export const normEmail = (e: string) => e.trim().toLowerCase();

/** Dev bypass: no Google credentials and not production → everyone is owner@local of the default org. */
export const devBypass = () => !env('AUTH_GOOGLE_ID') && env('NODE_ENV') !== 'production';
export const DEV_EMAIL = 'owner@local';

async function membershipsOf(userId: string): Promise<Membership[]> {
  const rows = await getRootDb().select({ orgId: schema.memberships.orgId, role: schema.memberships.role, orgName: schema.orgs.name })
    .from(schema.memberships).innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(eq(schema.memberships.userId, userId)).orderBy(schema.orgs.name);
  return rows;
}

async function userByEmail(email: string) {
  const [u] = await getRootDb().select().from(schema.users).where(eq(schema.users.email, normEmail(email)));
  return u;
}

/**
 * MW.auth.signin (rule) — allow a Google sign-in only for an email with a membership or an open invite.
 * Creates/updates the user and accepts every open invite for that email. Returns false to refuse.
 */
export async function signIn(p: { email: string | null | undefined; name?: string | null; sub?: string | null; emailVerified?: boolean }): Promise<boolean> {
  if (!p.email || p.emailVerified === false) return false;
  await initDb();
  const db = getRootDb();
  const email = normEmail(p.email);
  const invites = await db.select().from(schema.invites).where(and(eq(schema.invites.email, email), isNull(schema.invites.acceptedAt)));
  let user = await userByEmail(email);
  if (!user && !invites.length) return false;
  if (user && !invites.length && !(await membershipsOf(user.id)).length) return false;
  const now = nowIso();
  if (!user) {
    user = { id: newId('usr'), email, name: p.name ?? null, googleSub: p.sub ?? null, lastSeenAt: now, createdAt: now };
    await db.insert(schema.users).values(user);
  } else {
    await db.update(schema.users).set({ name: p.name ?? user.name, googleSub: p.sub ?? user.googleSub, lastSeenAt: now }).where(eq(schema.users.id, user.id));
  }
  for (const inv of invites) {
    await db.insert(schema.memberships).values({ id: newId('mem'), orgId: inv.orgId, userId: user.id, role: inv.role, createdAt: now }).onConflictDoNothing();
    await db.update(schema.invites).set({ acceptedAt: now }).where(eq(schema.invites.id, inv.id));
  }
  return true;
}

/** The identity behind a signed-in email, or null if it no longer belongs to any company. */
export async function identityForEmail(email: string): Promise<Identity | null> {
  await initDb();
  const u = await userByEmail(email);
  if (!u) return null;
  const memberships = await membershipsOf(u.id);
  if (!memberships.length) return null;
  return { userId: u.id, email: u.email, name: u.name, memberships };
}

/** Dev bypass identity: owner@local, owner of the default org (created on first use). */
export async function devIdentity(): Promise<Identity> {
  const orgId = await ensureOrg(DEFAULT_ORG_ID());
  const db = getRootDb();
  let u = await userByEmail(DEV_EMAIL);
  if (!u) {
    u = { id: 'usr_local_owner', email: DEV_EMAIL, name: 'Local owner', googleSub: null, lastSeenAt: null, createdAt: nowIso() };
    await db.insert(schema.users).values(u).onConflictDoNothing();
  }
  await db.insert(schema.memberships).values({ id: 'mem_local_owner', orgId, userId: u.id, role: 'owner', createdAt: nowIso() }).onConflictDoNothing();
  return (await identityForEmail(DEV_EMAIL))!;
}

/** Pick the active org: the requested one if the user belongs to it, else the first membership. */
export function pickOrg(id: Identity, requested: string | undefined | null): Membership {
  if (id.token) return id.memberships.find((m) => m.orgId === id.token!.orgId)!;
  return id.memberships.find((m) => m.orgId === requested) ?? id.memberships[0];
}

// ---------- API tokens (CLI) ----------

export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');
const lastTouch = new Map<string, number>();

/** Mint a token for (user, current org). The raw value is returned once and never stored. */
export function mintToken(): { raw: string; hash: string } {
  const raw = 'llx_' + randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

/** Resolve `Authorization: Bearer llx_…` → identity scoped to the token's org. Revoked/unknown → null. */
export async function identityForToken(raw: string): Promise<Identity | null> {
  if (!raw.startsWith('llx_')) return null;
  await initDb();
  const db = getRootDb();
  const [t] = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.tokenHash, hashToken(raw)));
  if (!t || t.revokedAt) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, t.userId));
  if (!u) return null;
  const memberships = (await membershipsOf(u.id)).filter((m) => m.orgId === t.orgId);
  if (!memberships.length) return null; // removed from that company → token dead
  // last_used_at at most once a minute per token: no write on every request.
  const now = Date.now();
  if ((lastTouch.get(t.id) ?? 0) < now - 60_000) {
    lastTouch.set(t.id, now);
    await db.update(schema.apiTokens).set({ lastUsedAt: nowIso() }).where(eq(schema.apiTokens.id, t.id));
  }
  return { userId: u.id, email: u.email, name: u.name, memberships, token: { id: t.id, orgId: t.orgId } };
}

export function requireRole(have: Role | null | undefined, need: Role) {
  if (!atLeast(have, need)) throw new AppError('forbidden', `${need[0].toUpperCase() + need.slice(1)} role needed`, 403);
}
