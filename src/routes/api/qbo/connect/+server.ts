// MW.qbo.connect — start the Intuit OAuth 2.0 authorization code flow for the current company (owner only).
// The server holds one Intuit app (QBO_CLIENT_ID/SECRET); each company signs in to its own QuickBooks.
import { redirect, error } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { env } from '$lib/server/env';
import { QBO_AUTH_URL } from '$lib/server/qbo';
import { atLeast } from '$lib/server/identity';
import { qboOAuthConfigured } from '$lib/server/ports';
export const GET = ({ cookies, locals }) => {
  if (!locals.orgId || !atLeast(locals.role, 'owner')) error(403, 'Only an owner can connect QuickBooks');
  if (!qboOAuthConfigured()) error(503, 'QuickBooks is not set up on this server (QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI) — see docs/self-host.md');
  const state = `${randomBytes(16).toString('hex')}.${locals.orgId}`;
  cookies.set('qbo_state', state, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600 });
  const q = new URLSearchParams({ client_id: env('QBO_CLIENT_ID'), redirect_uri: env('QBO_REDIRECT_URI'), response_type: 'code', scope: 'com.intuit.quickbooks.accounting', state });
  redirect(302, `${QBO_AUTH_URL}?${q}`);
};
