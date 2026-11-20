// Test harness: in-memory SQLite + fixture ports, wired fresh per test.
import { openDb, setDb } from '../src/lib/server/db';
import { setPorts } from '../src/lib/server/ports';
import { FixtureSlash } from '../src/lib/server/slash.fixture';
import { FixtureQbo } from '../src/lib/server/qbo';
import { FixtureQboWriter } from '../src/lib/server/qbo.write';
import { FixtureMercury } from '../src/lib/server/ledgers/mercury';
import { FixtureModel } from '../src/lib/server/ai/model';
import { resetAdapters } from '../src/lib/server/ledgers/registry';

process.env.TOKEN_ENC_KEY ??= 'test-only-key';

export function setup() {
  const conn = openDb(':memory:');
  setDb(conn);
  const ports = { slash: new FixtureSlash(), qbo: new FixtureQbo(), model: new FixtureModel(), local: null, mercury: new FixtureMercury(), qboWriter: new FixtureQboWriter() };
  setPorts(ports);
  resetAdapters();
  return { ...conn, ...ports };
}
