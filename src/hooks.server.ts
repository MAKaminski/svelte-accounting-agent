// Request pipeline: Auth.js (Google session) → who is calling (session, API token, or dev bypass) →
// which company and role → run the request inside that company's RLS context.
import { redirect, json, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { handle as authHandle } from './auth';
import { startScheduler } from '$lib/server/scheduler';
import { withOrg } from '$lib/server/db';
import { devBypass, devIdentity, identityForEmail, identityForToken, pickOrg, type Identity } from '$lib/server/identity';
import { env } from '$lib/server/env';

if (!building) {
  if (env('NODE_ENV') === 'production' && !env('AUTH_GOOGLE_ID')) {
    throw new Error('AUTH_GOOGLE_ID is required in production (the owner@local dev bypass is refused).');
  }
  startScheduler();
}

const PUBLIC = (p: string) => p === '/login' || p === '/api/health' || p.startsWith('/auth/');

const app: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;
  event.locals.user = null;
  event.locals.identity = null;
  event.locals.role = null;
  if (path === '/api/health' || path.startsWith('/auth/')) return resolve(event);

  let id: Identity | null = null;
  const bearer = event.request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (bearer) {
    id = await identityForToken(bearer);
    if (!id) return json({ error: { code: 'unauthorized', message: 'Invalid or revoked token', source: 'app' } }, { status: 401 });
  } else if (devBypass()) {
    id = await devIdentity();
  } else {
    const session = await event.locals.auth();
    if (session?.user?.email) id = await identityForEmail(session.user.email);
  }

  if (!id) {
    if (PUBLIC(path)) return resolve(event);
    if (path.startsWith('/api/')) return json({ error: { code: 'unauthorized', message: 'Sign in required (CLI: set BOOKS_TOKEN)', source: 'app' } }, { status: 401 });
    redirect(303, `/login?next=${encodeURIComponent(path)}`);
  }
  if (path === '/login') redirect(303, '/queue');

  const m = pickOrg(id, event.cookies.get('books_org'));
  event.locals.identity = id;
  event.locals.user = id.email;
  event.locals.orgId = m.orgId;
  event.locals.role = m.role;
  const actor = id.token ? `token:${id.token.id}` : id.userId;
  return withOrg(m.orgId, () => Promise.resolve(resolve(event)), actor);
};

export const handle = sequence(authHandle, app);
