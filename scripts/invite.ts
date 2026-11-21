// pnpm org:invite <email> [role] [org_id] — bootstrap: create an open invite (default: owner of the default
// company). Needed once per deployment, because inviting through the app requires an owner to be signed in.
// Runs as the owner role inside the org's RLS context; the person accepts by signing in with Google.
import { initDb, withOrg } from '../src/lib/server/db';
import { DEFAULT_ORG_ID, ensureOrg } from '../src/lib/server/orgs';
import { inviteMember } from '../src/lib/server/processes/members';

const [email, role = 'owner', orgArg] = process.argv.slice(2);
if (!email) { console.error('usage: pnpm org:invite <google-email> [owner|reviewer|viewer] [org_id]'); process.exit(1); }
process.env.APP_DB_ROLE ??= 'books_app';
await initDb();
const orgId = await ensureOrg(orgArg ?? DEFAULT_ORG_ID());
try {
  const m = await withOrg(orgId, () => inviteMember({ email, role }));
  console.error(`${m.kind === 'invite' ? 'Invited' : 'Added'} ${m.email} as ${m.role} of ${orgId}${m.kind === 'invite' ? ' — accepted on first Google sign-in' : ''}`);
  process.exit(0);
} catch (e) {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
}
