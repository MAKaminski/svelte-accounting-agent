import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('graph renders every lane and the selected node’s panel', async ({ page }) => {
  await page.goto('/system', { waitUntil: 'networkidle' });
  await expect(page.locator('.svelte-flow__node.node')).not.toHaveCount(0);
  for (const lane of ['Front-end', 'Middleware', 'AI', 'Back-end (tables)', 'Tools', 'External']) {
    await expect(page.locator('.lane-label', { hasText: lane })).toBeVisible();
  }
  await page.locator('.svelte-flow__node', { hasText: 'AI.entry.recommend' }).click();
  await expect(page.getByLabel('Selected component').getByText('AGENT')).toBeVisible();
});

test('switching off the recommend agent → manual mode, no model calls; back on restores', async ({ page, request }) => {
  await page.goto('/system?c=AI.entry.recommend', { waitUntil: 'networkidle' });
  const panel = page.getByLabel('Selected component');
  await panel.getByRole('switch').click();
  await panel.getByRole('button', { name: 'Switch off' }).click();
  await expect(page.locator('.svelte-flow__node.s-off', { hasText: 'AI.entry.recommend' })).toBeVisible();

  const comp = await (await request.get('/api/system/components/AI.entry.recommend')).json();
  expect(comp).toMatchObject({ enabled: false, status: 'off' });

  // Force a fresh recommendation for one entry: the agent is off, so it must be a manual placeholder.
  const rec = await (await request.post('/api/entries/ae_0057/recommend', { data: {} })).json();
  expect(rec.model).toBe('off:AI.entry.recommend');
  await page.goto('/queue', { waitUntil: 'networkidle' }); // hydrated before clicking
  await expect(page.getByText('Manual (agent off)').first()).toBeVisible();

  const on = await request.post('/api/system/components/AI.entry.recommend/state', { data: { enabled: true } });
  expect((await on.json()).enabled).toBe(true);
  const rec2 = await (await request.post('/api/entries/ae_0057/recommend', { data: {} })).json();
  expect(rec2.model).toContain('claude-haiku');
});

test('required components show no switch; the API refuses to turn them off', async ({ page, request }) => {
  await page.goto('/system/agents', { waitUntil: 'networkidle' });
  const row = page.locator('.row', { hasText: 'MW.entry.validate' });
  await expect(row.getByText('Required')).toBeVisible();
  const r = await request.post('/api/system/components/MW.entry.validate/state', { data: { enabled: false } });
  expect(r.status()).toBe(400);
});

test('process page shows the live state graph and runs', async ({ page }) => {
  await page.goto('/system/processes/AI.entry.recommend', { waitUntil: 'networkidle' });
  await expect(page.getByRole('img', { name: 'Entry state graph with live counts' })).toBeVisible();
  await expect(page.getByText('Recent runs')).toBeVisible();
});
