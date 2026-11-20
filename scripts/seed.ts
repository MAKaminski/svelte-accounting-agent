// pnpm db:seed — load fixture data (fixture mode): chart of accounts, entries + recommendations, payouts, eval cases.
import { readFileSync } from 'node:fs';
import { openDb, setDb } from '../src/lib/server/db';
import { env } from '../src/lib/server/env';
import { pullEntries } from '../src/lib/server/processes/pull';
import { importPayouts } from '../src/lib/server/processes/payouts';
import { seedEvalCases } from '../src/lib/server/processes/evals';
import { addConnection, listConnections, setConnectionStatus } from '../src/lib/server/ledgers/registry';

if (env('SLASH_MODE', 'fixture') !== 'fixture') { console.error('db:seed only runs in SLASH_MODE=fixture'); process.exit(1); }
setDb(openDb(env('DB_PATH', 'data/books.db')));
// Second ledger: Mercury (fixture), coded straight to QuickBooks. Bank feed confirmed + Mercury Checking → QuickBooks #10.
if (!listConnections().some((c) => c.id === 'conn_mercury')) {
  addConnection({ id: 'conn_mercury', kind: 'mercury', name: 'Mercury', mode: 'fixture', bankFeedConfirmed: true, by: 'seed',
    config: { qboBankAccountIdByAccount: { acc_chk: '10' } } });
  setConnectionStatus('conn_mercury', true);
}
const r = await pullEntries({ wait: true });
await importPayouts(readFileSync('fixtures/payouts/whatnot-2026-11.csv', 'utf8'), 'whatnot', { wait: true });
const n = seedEvalCases();
console.error(`seeded: ${r.pulled} entries in review (Slash + Mercury), ${r.newMerchants} new merchants, 3 payout rows, ${n} eval cases`);
