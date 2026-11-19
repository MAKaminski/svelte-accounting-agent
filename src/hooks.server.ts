import { redirect, json, type Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { timingSafeEqual } from 'node:crypto';
import { config } from '$lib/server/env';
import { startScheduler } from '$lib/server/scheduler';

import { sessionToken } from '$lib/server/auth';

function safeEq(a: string, b: string) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

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
  return resolve(event);
};
