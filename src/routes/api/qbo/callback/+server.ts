import { redirect, error } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { QBO_TOKEN_URL } from '$lib/server/qbo';
import { qboTokenStore } from '$lib/server/qbo.tokens';
export const GET = async ({ url, cookies }) => {
  if (url.searchParams.get('state') !== cookies.get('qbo_state')) error(400, 'OAuth state mismatch');
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
  qboTokenStore.save({ realmId, accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: new Date(Date.now() + j.expires_in * 1000).toISOString() });
  redirect(302, '/settings?qbo=connected');
};
