// pnpm diagrams:check — render every ```mermaid block in ARCHITECTURE.md and README.md with mmdc.
// A diagram that doesn't render is a broken deliverable.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'mmdc-'));
const chrome = process.env.PUPPETEER_EXECUTABLE_PATH ?? '/opt/pw-browsers/chromium';
const pcfg = join(dir, 'puppeteer.json');
writeFileSync(pcfg, JSON.stringify({ executablePath: chrome, args: ['--no-sandbox', '--headless'] }));
mkdirSync(join(dir, 'out'), { recursive: true });

let n = 0;
let failed = 0;
for (const file of ['ARCHITECTURE.md', 'README.md']) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const blocks = [...text.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const [i, src] of blocks.entries()) {
    n++;
    const inp = join(dir, `${file}-${i}.mmd`);
    writeFileSync(inp, src);
    try {
      execFileSync('pnpm', ['exec', 'mmdc', '-q', '-p', pcfg, '-i', inp, '-o', join(dir, 'out', `${file}-${i}.svg`)], { stdio: 'pipe' });
      console.error(`✓ ${file} diagram ${i + 1} (${src.split('\n')[0].trim()})`);
    } catch (e) {
      failed++;
      console.error(`✗ ${file} diagram ${i + 1}: ${String(e.stderr ?? e.message).split('\n').slice(0, 4).join(' ')}`);
    }
  }
}
console.error(`${n - failed}/${n} diagrams render`);
process.exit(failed ? 1 : 0);
