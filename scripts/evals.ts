// pnpm evals — run the eval suite in-process (no server) against a throwaway in-memory database and org,
// as the non-owner role under row-level security. Exit 1 if any case fails. Used by CI.
process.env.APP_DB_ROLE ??= 'books_app';
const { openDb, setRoot, useSessionOrg } = await import('../src/lib/server/db');
const { ensureOrg } = await import('../src/lib/server/orgs');
const { runEvals } = await import('../src/lib/server/processes/evals');

setRoot(await openDb('pglite:memory'));
await useSessionOrg(await ensureOrg('org_evals', 'Evals'));
const r = await runEvals();
for (const c of r.cases) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.kind.padEnd(6)} ${c.name}${c.failures.length ? ' — ' + c.failures.join('; ') : ''}`);
console.log(`Evals (${r.mode}): ${r.passed}/${r.total} · $${r.costUsd.toFixed(5)}`);
process.exit(r.passed === r.total ? 0 : 1);
