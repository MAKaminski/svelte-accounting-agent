// MW.qbo.connect — start the Intuit OAuth 2.0 authorization code flow (read-only scope).
import { redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { env } from '$lib/server/env';
import { QBO_AUTH_URL } from '$lib/server/qbo';
export const GET = ({ cookies }) => {
  const state = randomBytes(16).toString('hex');
  cookies.set('qbo_state', state, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600 });
  const q = new URLSearchParams({ client_id: env('QBO_CLIENT_ID'), redirect_uri: env('QBO_REDIRECT_URI'), response_type: 'code', scope: 'com.intuit.quickbooks.accounting', state });
  redirect(302, `${QBO_AUTH_URL}?${q}`);
};
