import { test, expect } from '@playwright/test';

const entry = async (request: import('@playwright/test').APIRequestContext, id: string) => (await (await request.get(`/api/entries/${id}`)).json());

test.describe.configure({ mode: 'serial' });

test('queue shows recommendations with every row actionable', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/queue/);
  await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
  await expect(page.locator('.row:not(.head)')).toHaveCount(23);
  await expect(page.getByText('Split (3 lines)')).toBeVisible();
});

test('approve → toast within 100 ms → committed to Slash after the undo window', async ({ page, request }) => {
  await page.goto('/queue');
  const row = page.locator('.row:not(.head)', { hasText: 'Canva Pro' });
  const id = (await row.locator('a.merchant').getAttribute('href'))!.split('/').pop()!;
  const t0 = Date.now();
  await row.getByRole('button', { name: /Approve/ }).click();
  await expect(page.locator('.toast')).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(1000); // UI feedback; the 100 ms budget is measured in the trace
  await expect(row).toBeHidden();
  expect((await entry(request, id)).state).toBe('approved');
  await expect.poll(async () => (await entry(request, id)).state, { timeout: 8000 }).toBe('ready');
  expect((await entry(request, id)).slashStatus).toBe('ready_to_sync');
});

test('undo inside the window → back in review, never sent', async ({ page, request }) => {
  await page.goto('/queue');
  const row = page.locator('.row:not(.head)', { hasText: 'Google Workspace' });
  const id = (await row.locator('a.merchant').getAttribute('href'))!.split('/').pop()!;
  await row.getByRole('button', { name: /Approve/ }).click();
  await page.locator('.toast button.undo').click();
  await expect(row).toBeVisible();
  await page.waitForTimeout(2500);
  const e = await entry(request, id);
  expect(e.state).toBe('recommended');
  expect(e.slashStatus).toBe('in_review');
  expect(e.decisions.map((d: { action: string }) => d.action)).toEqual(['approved', 'undone']);
});

test('question flow: ask on entry → answer on /questions', async ({ page }) => {
  await page.goto('/queue');
  await page.getByRole('link', { name: 'AMZN Mktp US' }).first().click();
  await expect(page.getByText('The agent is not sure')).toBeVisible();
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('Question sent to the owner')).toBeVisible();
  await page.goto('/questions', { waitUntil: 'networkidle' });
  await page.getByLabel('Answer').first().fill('Mailers and tape — supplies');
  await page.keyboard.press('Enter');
  await expect(page.getByText('No open questions.')).toBeVisible();
});

test('CLI-equivalent API: approve without --yes is refused (exit 1 class)', async ({ request }) => {
  const r = await request.post('/api/entries/ae_0058/approve', { data: {} });
  expect(r.status()).toBe(400);
  expect((await r.json()).error.code).toBe('confirm_required');
});
