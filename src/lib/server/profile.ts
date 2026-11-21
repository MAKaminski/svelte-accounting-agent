// Company profile: what the business does and how it likes things coded. Stored on orgs.profile_json
// (a global table, read with the owner connection); feeds the AI.entry.recommend system prompt.
import { eq } from 'drizzle-orm';
import { currentOrgId, getDb, getRootDb, hasOrgContext, initDb, schema, withRoot } from './db';
import { AppError } from './util';

export interface CompanyProfile {
  /** One or two sentences: what the company sells and how it gets paid. */
  business: string;
  /** House coding rules, one per line ("Shipping labels → Shipping & Postage"). */
  codingRules: string;
  /** Demo companies start with synthetic Slash and QuickBooks data. Real companies start empty. */
  sampleData: boolean;
}

export const LIMITS = { business: 600, codingRules: 3000 };

/** Rules that hold for most small businesses. Shown as the starting point; owners edit them in Settings → Company. */
export const DEFAULT_CODING_RULES = [
  'Inventory or materials bought for resale → Inventory (or Cost of Goods Sold if the chart has no inventory account). Ask when the vendor also sells supplies (e.g. Amazon) and history is mixed.',
  'Marketplace or payment-processor payouts: split into Sales (gross, positive), the platform fees (negative) and any shipping it deducted (negative), using the matched payout_row evidence; the parts must sum to the deposit.',
  'Shipping labels and postage (USPS, UPS, FedEx, label services) → Shipping & Postage.',
  'Packaging and office supplies → Supplies.',
  'Ads and promotion (Meta, Google, marketplace promotions) → Advertising & Marketing.',
  'Software and SaaS subscriptions → Software & Subscriptions.',
  'Bank, wire and card-processing fees → Bank Fees.',
  'Transfers between own accounts → never coded; always ask.',
  "Owner draws / personal spending → Owner's Draw, but ask unless an owner answer or mapping says so."
].map((r) => `- ${r}`).join('\n');

/** The demo company's profile (the sample data is a small online reseller). */
export const DEMO_PROFILE: CompanyProfile = {
  business: 'A small online reseller (sneakers, apparel, accessories) that sells mainly through live-selling marketplaces. This is a demo company with synthetic data.',
  codingRules: DEFAULT_CODING_RULES,
  sampleData: true
};

function parse(json: string | null | undefined): CompanyProfile {
  const raw = JSON.parse(json || '{}') as Partial<CompanyProfile>;
  // Rows created before profiles existed are the demo company.
  if (raw.business === undefined) return { ...DEMO_PROFILE, ...raw };
  return { business: raw.business, codingRules: raw.codingRules ?? DEFAULT_CODING_RULES, sampleData: raw.sampleData ?? false };
}

/**
 * Inside the company's own context, read through the tenant connection (orgs has no RLS and books_app may read it):
 * a second connection while a transaction holds one would deadlock a small pool.
 */
export async function getProfile(orgId: string): Promise<CompanyProfile & { name: string }> {
  await initDb();
  const inOwn = hasOrgContext() && currentOrgId() === orgId;
  const read = (db: ReturnType<typeof getRootDb>) => db.select({ name: schema.orgs.name, profileJson: schema.orgs.profileJson }).from(schema.orgs).where(eq(schema.orgs.id, orgId));
  const [row] = inOwn ? await read(getDb()) : await withRoot(() => read(getRootDb()));
  if (!row) throw new AppError('not_found', `company ${orgId} not found`, 404);
  return { name: row.name, ...parse(row.profileJson) };
}

export function validateProfile(p: { business?: string; codingRules?: string }) {
  if (p.business !== undefined && p.business.length > LIMITS.business) throw new AppError('too_long', `business description is at most ${LIMITS.business} characters`, 400);
  if (p.codingRules !== undefined && p.codingRules.length > LIMITS.codingRules) throw new AppError('too_long', `coding rules are at most ${LIMITS.codingRules} characters`, 400);
}

/** FE.company.update — name, description and coding rules. Changing them changes the prompt prefix (cache) by design. */
export async function updateProfile(orgId: string, patch: { name?: string; business?: string; codingRules?: string }) {
  validateProfile(patch);
  const cur = await getProfile(orgId);
  const next: CompanyProfile = {
    business: (patch.business ?? cur.business).trim(),
    codingRules: (patch.codingRules ?? cur.codingRules).trim() || DEFAULT_CODING_RULES,
    sampleData: cur.sampleData
  };
  const name = patch.name?.trim() || cur.name;
  const write = (db: ReturnType<typeof getRootDb>) => db.update(schema.orgs).set({ name, profileJson: JSON.stringify(next) }).where(eq(schema.orgs.id, orgId));
  // Called from the company's own request: write through its connection (orgs has no RLS; books_app may update it).
  if (hasOrgContext() && currentOrgId() === orgId) await write(getDb()); else await withRoot(() => write(getRootDb()));
  return { name, ...next };
}
