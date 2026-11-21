// pnpm gifs — record short walkthroughs of a running, seeded app and convert them to GIFs in docs/media/.
// Needs ffmpeg. Usage: BASE=http://localhost:5173 pnpm gifs   (use a freshly seeded DB; the flows approve entries)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? 'docs/media';
const local = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const size = { width: 1200, height: 720 };
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(existsSync(local) ? { executablePath: local } : {});
const wait = (p, ms) => p.waitForTimeout(ms);

// Frames are captured as screenshots (no Playwright video codec needed) and assembled with ffmpeg.
async function record(name, flow) {
  const dir = mkdtempSync(join(tmpdir(), 'gif-'));
  const ctx = await browser.newContext({ viewport: size });
  const page = await ctx.newPage();
  let n = 0, on = true;
  const loop = (async () => {
    while (on) {
      const t = Date.now();
      await page.screenshot({ path: join(dir, `f${String(n++).padStart(4, '0')}.png`) }).catch(() => { n--; });
      await new Promise((r) => setTimeout(r, Math.max(0, 100 - (Date.now() - t))));
    }
  })();
  await flow(page);
  on = false; await loop;
  await ctx.close();
  const pal = join(dir, 'pal.png');
  const src = ['-framerate', '10', '-i', join(dir, 'f%04d.png')];
  const vf = 'scale=900:-1:flags=lanczos';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...src, '-vf', `${vf},palettegen=max_colors=96:stats_mode=diff`, pal]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...src, '-i', pal, '-lavfi', `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, `${OUT}/${name}.gif`]);
  console.log(`${name}.gif (${n} frames)`);
}

// 1. Approve a routine entry, then undo it from the toast.
await record('approve-undo', async (page) => {
  await page.goto(`${BASE}/queue`, { waitUntil: 'networkidle' });
  await wait(page, 900);
  const row = page.locator('.row:not(.head)', { hasText: 'USPS PO 1234' }).first();
  await row.click(); await wait(page, 700);
  await row.getByRole('button', { name: /Approve/ }).click();
  await wait(page, 2200);
  await page.locator('.toast button.undo').click();
  await wait(page, 1600);
});

// 2. The agent is unsure: open the entry, read its question, ask the owner.
await record('ask-owner', async (page) => {
  await page.goto(`${BASE}/queue`, { waitUntil: 'networkidle' });
  await wait(page, 700);
  await page.getByRole('link', { name: 'AMZN Mktp US' }).first().click();
  await page.waitForLoadState('networkidle'); await wait(page, 1800);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await wait(page, 1500);
  await page.goto(`${BASE}/questions`, { waitUntil: 'networkidle' });
  await wait(page, 1800);
});

// 3. Control plane: select the recommend agent and see its switch and stats.
await record('control-plane', async (page) => {
  await page.goto(`${BASE}/system`, { waitUntil: 'networkidle' });
  await wait(page, 1200);
  await page.locator('.svelte-flow__node', { hasText: 'Recommend coding' }).click();
  await wait(page, 2000);
  await page.goto(`${BASE}/system/agents`, { waitUntil: 'networkidle' });
  await wait(page, 1800);
});

await browser.close();
