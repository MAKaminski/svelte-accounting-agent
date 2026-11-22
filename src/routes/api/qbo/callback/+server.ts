// MW.qbo.connect (callback) — exchange the code, store this company's tokens (encrypted), back to Settings.
import { redirect, error } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { QBO_TOKEN_URL } from '$lib/server/qbo';
import { qboTokenStore } from '$lib/server/qbo.tokens';
import { getPorts, OrgQbo } from '$lib/server/ports';
import { audit } from '$lib/server/audit';
export const GET = async ({ url, cookies, locals }) => {
  const state = url.searchParams.get('state');
  if (!state || state !== cookies.get('qbo_state')) error(400, 'OAuth state mismatch — start again from Settings');
  // The company that started the flow must still be the current one (no cross-company token landing).
  if (state.split('.')[1] !== locals.orgId) error(400, 'You switched company during sign-in — start again from Settings');
  cookies.delete('qbo_state', { path: '/' });
  if (url.searchParams.get('error')) redirect(302, '/settings?qbo=cancelled');
  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');
  if (!code || !realmId) error(400, 'Missing code or realmId');
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json',
      authorization: 'Basic ' + Buffer.from(`${env('QBO_CLIENT_ID')}:${env('QBO_CLIENT_SECRET')}`).toString('base64') },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env('QBO_REDIRECT_URI') }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) error(502, `QuickBooks token exchange failed (${res.status})`);
  const j = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  await qboTokenStore.save({ realmId, accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: new Date(Date.now() + j.expires_in * 1000).toISOString() });
  const qbo = getPorts().qbo;
  if (qbo instanceof OrgQbo) qbo.reset(locals.orgId!);
  await audit('MW.qbo.connect', realmId, { realmId });
  redirect(302, '/settings?qbo=connected');
};
