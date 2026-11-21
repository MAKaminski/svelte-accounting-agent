import { test, expect } from '@playwright/test';

// Runs with the dev bypass (AUTH_GOOGLE_ID empty): the browser is owner@local of the default company.
test('members: invite, change role, cancel; token shown once then revoked', async ({ page }) => {
  await page.goto('/settings/members', { waitUntil: 'networkidle' }); // hydrated before clicking
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
  await expect(page.getByLabel('Members').getByText('owner@local')).toBeVisible();
  // The only owner can't change or remove themself.
  await expect(page.getByLabel('Role for owner@local')).toBeDisabled();

  const email = `bookkeeper-${Date.now()}@example.com`;
  await page.getByLabel('Google email').fill(email);
  await page.getByRole('button', { name: 'Send invite' }).click();
  const row = page.locator('.row', { hasText: email });
  await expect(row.getByText('Invite pending')).toBeVisible();
  await row.getByLabel(`Role for ${email}`).selectOption('viewer');
  await expect(page.getByText(`${email} is now viewer`)).toBeVisible();

  await row.getByRole('button', { name: 'Cancel invite' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.row', { hasText: email })).toHaveCount(0);

  await page.getByLabel('Token name').fill('e2e token');
  await page.getByRole('button', { name: 'New token' }).click();
  const once = page.getByRole('status').filter({ hasText: "won't be shown again" });
  await expect(once).toBeVisible();
  const token = (await once.locator('code').textContent())!.trim();
  expect(token).toMatch(/^llx_/);

  // The token works against the API, then 401s once revoked.
  const ok = await page.request.get('/api/auth/whoami', { headers: { authorization: `Bearer ${token}` } });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).via).toBe('token');
  await once.getByRole('button', { name: 'Done' }).click();
  await page.locator('.trow', { hasText: 'e2e token' }).getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click();
  await expect(page.locator('.trow', { hasText: 'e2e token' })).toHaveClass(/revoked/);
  const dead = await page.request.get('/api/auth/whoami', { headers: { authorization: `Bearer ${token}` } });
  expect(dead.status()).toBe(401);
});

test('nav shows the signed-in identity and a Members link for owners', async ({ page }) => {
  await page.goto('/queue', { waitUntil: 'networkidle' }); // hydrated before clicking
  await expect(page.getByText('owner@local · owner')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Members' })).toBeVisible();
});
