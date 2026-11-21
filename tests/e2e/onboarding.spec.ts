import { test, expect } from '@playwright/test';

// Dev bypass: owner@local already has the demo company; /welcome lets any signed-in user add another.
test('create a company → land on Settings with the setup checklist; the profile is editable', async ({ page }) => {
  await page.goto('/welcome', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Add another company' })).toBeVisible();
  await page.getByLabel('Company name').fill(`Zeta Test Co ${Date.now()}`);
  await page.getByRole('button', { name: 'Two-person design agency' }).click();
  await page.getByRole('button', { name: 'Create company' }).click();

  await expect(page).toHaveURL(/\/settings/);
  const setup = page.getByLabel('Setup checklist');
  await expect(setup.getByText(/^[12] of 5 done$/)).toBeVisible(); // QuickBooks counts as connected when the server runs QBO_MODE=fixture
  await expect(setup.getByRole('link', { name: 'Start' })).toHaveAttribute('href', '/ledgers');

  const company = page.getByLabel('Company', { exact: true });
  await expect(company.getByLabel(/What it does/)).toHaveValue(/design agency/);
  await company.getByLabel(/What it does/).fill('Design agency; clients pay by ACH.');
  await company.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Company saved/)).toBeVisible();

  // A real company starts with no ledgers and asks for a key.
  await page.goto('/ledgers', { waitUntil: 'networkidle' });
  await expect(page.getByText('No ledgers connected.')).toBeVisible();
  // QuickBooks: the server runs in fixture mode here, so no Connect button — but the copy explains the Intuit sign-in.
  await page.goto('/settings#quickbooks', { waitUntil: 'networkidle' });
  await expect(page.getByLabel('QuickBooks').getByText(/own Intuit login/)).toBeVisible();
});

test('company-less API calls are refused with a pointer to /welcome', async ({ request }) => {
  const r = await request.post('/api/orgs', { data: { name: 'No description' } });
  expect(r.status()).toBe(400);
  expect((await r.json()).error.message).toMatch(/what the company does/);
});
