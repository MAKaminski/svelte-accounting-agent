import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('ledgers screen lists Slash and Mercury with how each writes', async ({ page }) => {
  await page.goto('/ledgers', { waitUntil: 'networkidle' });
  const slash = page.locator('article', { hasText: 'conn_slash' });
  const mercury = page.locator('article', { hasText: 'conn_mercury' });
  await expect(slash.getByText('Slash → its QuickBooks sync')).toBeVisible();
  await expect(mercury.getByText('QuickBooks directly (dedupe first)')).toBeVisible();
  await expect(mercury.getByText('Active', { exact: true })).toBeVisible();
  await mercury.getByRole('button', { name: 'Test' }).click();
  await expect(mercury.getByText(/Test passed/)).toBeVisible();
});

test('a new Mercury connection cannot be activated until the bank feed is confirmed and accounts are mapped', async ({ page }) => {
  await page.goto('/ledgers', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Add connection' }).click();
  const panel = page.getByLabel('Add connection');
  await panel.getByLabel('Name').fill('Mercury Savings');
  // Live is the default: the key field links to where the key lives, and Add waits for a key.
  await expect(panel.getByRole('link', { name: /Settings → Tokens/ })).toHaveAttribute('href', 'https://app.mercury.com/settings/tokens');
  await expect(panel.getByRole('button', { name: 'Add connection' })).toBeDisabled();
  await panel.getByLabel('Data').selectOption('fixture');
  await expect(panel.getByText(/booked twice/)).toBeVisible();
  await panel.getByRole('button', { name: 'Add connection' }).click();

  const config = page.getByLabel('Configure Mercury Savings');
  await expect(config).toBeVisible();
  const card = page.locator('article', { hasText: 'Mercury Savings' });
  await expect(card.getByText('Before activating:')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Activate' })).toBeDisabled();

  await config.getByLabel('QuickBooks bank account for Mercury Checking').selectOption('10');
  await config.getByRole('checkbox').check();
  await config.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(card.getByText('Before activating:')).toBeHidden();
  await card.getByRole('button', { name: 'Activate' }).click();
  await expect(card.getByText('Active', { exact: true })).toBeVisible();
});

test('approving a Mercury item writes it to QuickBooks (fixture) and shows the txn', async ({ page, request }) => {
  await page.goto('/queue?connection=conn_mercury', { waitUntil: 'networkidle' });
  const row = page.locator('.row:not(.head)', { hasText: 'FACEBK ADS' });
  await expect(row.getByText('Mercury')).toBeVisible();
  const id = (await row.locator('a.merchant').getAttribute('href'))!.split('/').pop()!;
  await row.getByRole('button', { name: /Approve/ }).click();
  await expect.poll(async () => (await (await request.get(`/api/entries/${id}`)).json()).state, { timeout: 8000 }).toBe('ready');
  await page.goto(`/entry/${id}`, { waitUntil: 'networkidle' });
  await expect(page.getByText(/Writes to: QuickBooks directly \(Purchase\)/)).toBeVisible();
  await expect(page.getByText(/QuickBooks txn qb_/)).toBeVisible();
});

test('CLI-equivalent: ledger list and activation refusal over the API', async ({ request }) => {
  const list = await (await request.get('/api/ledgers')).json();
  expect(list.map((l: { kind: string }) => l.kind)).toEqual(expect.arrayContaining(['slash', 'mercury']));
  const add = await (await request.post('/api/ledgers', { data: { kind: 'mercury', name: 'No Setup' } })).json();
  const r = await request.post(`/api/ledgers/${add.id}/state`, { data: { active: true } });
  expect(r.status()).toBe(409);
  expect((await r.json()).error.message).toMatch(/booked twice/);
});
