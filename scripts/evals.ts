// pnpm evals — run the eval suite in-process (no server). Exit 1 if any case fails. Used by CI.
import { openDb, setDb } from '../src/lib/server/db';
import { env } from '../src/lib/server/env';
import { runEvals } from '../src/lib/server/processes/evals';

setDb(openDb(env('DB_PATH', 'data/books.db')));
const r = await runEvals();
for (const c of r.cases) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.kind.padEnd(6)} ${c.name}${c.failures.length ? ' — ' + c.failures.join('; ') : ''}`);
console.log(`Evals (${r.mode}): ${r.passed}/${r.total} · $${r.costUsd.toFixed(5)}`);
process.exit(r.passed === r.total ? 0 : 1);
