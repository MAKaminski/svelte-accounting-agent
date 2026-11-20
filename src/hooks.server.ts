import { redirect, json, type Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { timingSafeEqual } from 'node:crypto';
import { config } from '$lib/server/env';
import { startScheduler } from '$lib/server/scheduler';
import { withOrg } from '$lib/server/db';
import { ensureOrg } from '$lib/server/orgs';

import { sessionToken } from '$lib/server/auth';

function safeEq(a: string, b: string) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

// One default org until Google sign-in lands (M8 step 3); every request runs in its RLS context.
const orgReady = building ? Promise.resolve('') : ensureOrg();
if (!building) startScheduler();

export const handle: Handle = async ({ event, resolve }) => {
  const pass = config.passcode;
  event.locals.user = null;
  if (!pass) {
    event.locals.user = config.reviewer; // passcode unset: local dev, open (Settings shows a warning)
  } else {
    const cookie = event.cookies.get('books_session');
    const header = event.request.headers.get('x-books-passcode');
    if ((cookie && safeEq(cookie, sessionToken(pass))) || (header && safeEq(header, pass))) event.locals.user = config.reviewer;
  }
  const open = event.url.pathname === '/login' || event.url.pathname === '/api/health';
  if (!event.locals.user && !open) {
    if (event.url.pathname.startsWith('/api/')) return json({ error: { code: 'unauthorized', message: 'Passcode required (set APP_PASSCODE for the CLI)', source: 'app' } }, { status: 401 });
    redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
  }
  if (event.url.pathname === '/api/health') return resolve(event);
  const orgId = await orgReady;
  event.locals.orgId = orgId;
  return withOrg(orgId, () => Promise.resolve(resolve(event)), event.locals.user);
};
