// pnpm shots — screenshot every screen of a running, seeded app (dark + light) into docs/media/.
// Usage: BASE=http://localhost:5173 pnpm shots [--only queue,entry] [--theme dark]
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? 'docs/media';
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
const only = arg('only')?.split(',');
const themes = arg('theme') ? [arg('theme')] : ['dark', 'light'];
const local = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(existsSync(local) ? { executablePath: local } : {});
await fetch(`${BASE}/api/evals/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => undefined); // so /evals shows a run
const entries = await (await fetch(`${BASE}/api/entries`)).json();
const split = entries.find((e) => (e.recommendation?.lines?.length ?? 0) > 1) ?? entries[0];
const screens = [
  ['queue', '/queue'], ['entry', `/entry/${split.id}`], ['questions', '/questions'], ['rules', '/mappings'],
  ['evals', '/evals'], ['ledgers', '/ledgers'], ['system', '/system'], ['agents', '/system/agents'],
  ['tools', '/system/tools'], ['process', '/system/processes/AI.entry.recommend'], ['settings', '/settings'],
  ['members', '/settings/members']
].filter(([n]) => !only || only.includes(n));

for (const theme of themes) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.SCALE ?? 1) });
  await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  for (const [name, path] of screens) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(name === 'system' ? 1200 : 300);
    await page.screenshot({ path: `${OUT}/${name}-${theme}.png` });
    console.log(`${name}-${theme}.png`);
  }
  await ctx.close();
}
await browser.close();
