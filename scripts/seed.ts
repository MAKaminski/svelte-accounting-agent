// pnpm db:seed — load fixture data into the default org (fixture mode): chart of accounts, entries + recommendations,
// payouts, eval cases. Runs inside the org's RLS context.
import { readFileSync } from 'node:fs';
import { initDb, withOrg } from '../src/lib/server/db';
import { ensureOrg } from '../src/lib/server/orgs';
import { env } from '../src/lib/server/env';
import { pullEntries } from '../src/lib/server/processes/pull';
import { importPayouts } from '../src/lib/server/processes/payouts';
import { seedEvalCases } from '../src/lib/server/processes/evals';
import { addConnection, listConnections, setConnectionStatus } from '../src/lib/server/ledgers/registry';

if (env('SLASH_MODE', 'fixture') !== 'fixture') { console.error('db:seed only runs in SLASH_MODE=fixture'); process.exit(1); }
process.env.APP_DB_ROLE ??= 'books_app';
await initDb();
const orgId = await ensureOrg();
await withOrg(orgId, async () => {
  // Second ledger: Mercury (fixture), coded straight to QuickBooks. Bank feed confirmed + Mercury Checking → QuickBooks #10.
  if (!(await listConnections()).some((c) => c.id === 'conn_mercury')) {
    await addConnection({ id: 'conn_mercury', kind: 'mercury', name: 'Mercury', mode: 'fixture', bankFeedConfirmed: true, by: 'seed',
      config: { qboBankAccountIdByAccount: { acc_chk: '10' } } });
    await setConnectionStatus('conn_mercury', true);
  }
  const r = await pullEntries({ wait: true });
  await importPayouts(readFileSync('fixtures/payouts/whatnot-2026-11.csv', 'utf8'), 'whatnot', { wait: true });
  const n = await seedEvalCases();
  console.error(`seeded ${orgId}: ${r.pulled} entries in review (Slash + Mercury), ${r.newMerchants} new merchants, 3 payout rows, ${n} eval cases`);
});
process.exit(0);
