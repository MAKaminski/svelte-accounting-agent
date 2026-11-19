// Test harness: in-memory SQLite + fixture ports, wired fresh per test.
import { openDb, setDb } from '../src/lib/server/db';
import { setPorts } from '../src/lib/server/ports';
import { FixtureSlash } from '../src/lib/server/slash.fixture';
import { FixtureQbo } from '../src/lib/server/qbo';
import { FixtureModel } from '../src/lib/server/ai/model';

export function setup() {
  const conn = openDb(':memory:');
  setDb(conn);
  const ports = { slash: new FixtureSlash(), qbo: new FixtureQbo(), model: new FixtureModel(), local: null };
  setPorts(ports);
  return { ...conn, ...ports };
}
