// Generates the synthetic fixtures under fixtures/. Deterministic; rerun with `pnpm tsx scripts/make-fixtures.ts`.
// Every value here is invented. No real LaceLuxx data ever goes into fixtures or git.
import { writeFileSync, mkdirSync } from 'node:fs';
import { normalizeMerchant } from '../src/lib/server/util';

const out = (p: string, v: unknown) => { mkdirSync(p.split('/').slice(0, -1).join('/'), { recursive: true }); writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n'); };

const accounts = [
  ['dv_inventory', 'Inventory'], ['dv_cogs', 'Cost of Goods Sold'], ['dv_sales', 'Sales'], ['dv_platform_fees', 'Platform Fees'],
  ['dv_shipping', 'Shipping & Postage'], ['dv_supplies', 'Supplies'], ['dv_ads', 'Advertising & Marketing'],
  ['dv_software', 'Software & Subscriptions'], ['dv_owner_draw', "Owner's Draw"], ['dv_bank_fees', 'Bank Fees']
].map(([id, name]) => ({ id, name, enabled: true }));
accounts.push({ id: 'dv_misc_old', name: 'Miscellaneous (old)', enabled: false });

type M = { id: string; description: string; mcc: string; categoryId: string } | null;
const M = (id: string, description: string, mcc: string, categoryId: string): M => ({ id, description, mcc, categoryId });
const usps = M('mer_usps', 'USPS PO 1234', '9402', 'cat_postal');
const amzn = M('mer_amzn', 'AMZN Mktp US', '5942', 'cat_retail');
const pirate = M('mer_pirateship', 'Pirate Ship', '4215', 'cat_courier');
const canva = M('mer_canva', 'Canva Pro', '5734', 'cat_software');
const shopify = M('mer_shopify', 'Shopify* Subscription', '5734', 'cat_software');
const uline = M('mer_uline', 'ULINE', '5111', 'cat_office');
const meta = M('mer_meta', 'FACEBK *ADS', '7311', 'cat_advertising');
const shipstation = M('mer_shipstation', 'ShipStation', '4215', 'cat_courier');
const etsyads = M('mer_etsyads', 'Etsy Ads', '7311', 'cat_advertising');
const packlane = M('mer_packlane', 'Packlane', '5111', 'cat_office');
const kicks = M('mer_kicks', 'Kicks Wholesale LLC', '5139', 'cat_wholesale');
const gws = M('mer_gworkspace', 'Google Workspace', '5734', 'cat_software');
const adobe = M('mer_adobe', 'Adobe Creative Cloud', '5734', 'cat_software');

const entries: unknown[] = [];
const transactions: unknown[] = [];
let n = 0;
function add(status: string, date: string, m: M, description: string, amountCents: number, coding?: { account?: string; lines?: [string, number, string][] }) {
  n++;
  const id = `ae_${String(n).padStart(4, '0')}`;
  const txId = `tx_${String(n).padStart(4, '0')}`;
  const e: Record<string, unknown> = { id, status, amountCents, memo: null, transactionId: txId, createdAt: `${date}T14:00:00.000Z` };
  if (coding?.account) e.dimensions = { account: coding.account };
  if (coding?.lines) e.lineItems = coding.lines.map(([acct, amt, d]) => ({ amountCents: amt, description: d, dimensions: { account: acct } }));
  entries.push(e);
  const t: Record<string, unknown> = { id: txId, date, description, amountCents, accountingEntryId: id };
  if (m) t.cardDetails = { merchant: { id: m.id, description: m.description, categoryCode: m.mcc, categoryId: m.categoryId } };
  transactions.push(t);
}

// --- History: synced entries from October 2026 (what Slash already coded and synced) ---
const oct = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;
for (let i = 0; i < 14; i++) add('synced', oct(1 + (i % 28)), usps, usps!.description, -(700 + i * 113), { account: 'dv_shipping' });
for (let i = 0; i < 6; i++) add('synced', oct(2 + i * 4), amzn, amzn!.description, -(8000 + i * 2500), { account: 'dv_inventory' });
for (let i = 0; i < 4; i++) add('synced', oct(3 + i * 6), amzn, amzn!.description, -(1500 + i * 700), { account: 'dv_supplies' });
for (let i = 0; i < 3; i++) add('synced', oct(5 + i * 9), canva, canva!.description, -1499, { account: 'dv_software' });
for (let i = 0; i < 4; i++) add('synced', oct(4 + i * 7), shopify, shopify!.description, -3900, { account: 'dv_software' });
for (let i = 0; i < 3; i++) add('synced', oct(6 + i * 8), meta, meta!.description, -(4000 + i * 1000), { account: 'dv_ads' });
for (let i = 0; i < 4; i++) add('synced', oct(7 + i * 6), kicks, kicks!.description, -(90000 + i * 15000), { account: 'dv_inventory' });
for (let i = 0; i < 2; i++) add('synced', oct(10 + i * 14), gws, gws!.description, -1400, { account: 'dv_software' });
for (let i = 0; i < 2; i++) add('synced', oct(11 + i * 14), adobe, adobe!.description, -5999, { account: 'dv_software' });
for (let i = 0; i < 2; i++) add('synced', oct(12 + i * 10), null, 'Outgoing wire fee', -2500, { account: 'dv_bank_fees' });
const pastPayouts = [[180000, 19800, 5200], [152500, 16775, 4100], [210000, 23100, 6300], [99000, 10890, 2900], [175500, 19305, 4800]];
pastPayouts.forEach(([g, f, s], i) => add('synced', oct(4 + i * 6), null, `WHATNOT PAYOUT WN-87${70 + i * 5}`, g - f - s,
  { lines: [['dv_sales', g, 'Gross sales'], ['dv_platform_fees', -f, 'Whatnot fees'], ['dv_shipping', -s, 'Buyer shipping labels']] }));

// --- In review: the 23 entries the queue starts with (November 2026) ---
const nov = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;
const review: [string, M, string, number][] = [
  [nov(17), usps, usps!.description, -1840],
  [nov(17), amzn, amzn!.description, -21237],
  [nov(16), null, 'WHATNOT PAYOUT WN-8812', 184210],
  [nov(16), pirate, pirate!.description, -4310],
  [nov(16), null, 'Book transfer from Slash Checking 4421', 50000],
  [nov(15), null, 'Zelle to J Smith', -30000],
  [nov(15), canva, canva!.description, -1499],
  [nov(14), uline, uline!.description, -9675],
  [nov(14), usps, usps!.description, -785],
  [nov(13), meta, meta!.description, -5000],
  [nov(13), shipstation, shipstation!.description, -2999],
  [nov(12), kicks, kicks!.description, -125000],
  [nov(12), usps, usps!.description, -2210],
  [nov(11), amzn, amzn!.description, -4512],
  [nov(11), etsyads, etsyads!.description, -2500],
  [nov(10), gws, gws!.description, -1400],
  [nov(10), null, 'Outgoing wire fee', -2500],
  [nov(9), meta, meta!.description, -7500],
  [nov(8), shopify, shopify!.description, -3900],
  [nov(7), adobe, adobe!.description, -5999],
  [nov(6), uline, uline!.description, -14320],
  [nov(5), packlane, packlane!.description, -18650],
  [nov(3), kicks, kicks!.description, -86000]
];
for (const [d, m, desc, amt] of review) add('in_review', d, m, desc, amt);

out('fixtures/slash/accounts.json', accounts);
out('fixtures/slash/entries.json', entries);
out('fixtures/slash/transactions.json', transactions);

// --- QuickBooks (pre-Slash history) ---
out('fixtures/qbo/vendors.json', [
  { id: 'qv_1', name: 'Uline Inc' }, { id: 'qv_2', name: 'Kicks Wholesale' }, { id: 'qv_3', name: 'USPS' }, { id: 'qv_4', name: 'Amazon' }
]);
const qp = (id: string, vendorId: string, vendorName: string, date: string, amountCents: number, accountName: string) => ({ id, vendorId, vendorName, date, amountCents, accountName });
out('fixtures/qbo/purchases.json', [
  qp('qp_1', 'qv_1', 'Uline Inc', '2026-06-03', -11240, 'Supplies'), qp('qp_2', 'qv_1', 'Uline Inc', '2026-07-19', -8730, 'Supplies'),
  qp('qp_3', 'qv_1', 'Uline Inc', '2026-08-28', -15400, 'Supplies'),
  qp('qp_4', 'qv_2', 'Kicks Wholesale', '2026-07-02', -110000, 'Inventory'), qp('qp_5', 'qv_2', 'Kicks Wholesale', '2026-08-14', -95000, 'Inventory'),
  qp('qp_6', 'qv_3', 'USPS', '2026-08-01', -1210, 'Shipping & Postage'),
  qp('qp_7', 'qv_4', 'Amazon', '2026-07-08', -9900, 'Inventory'), qp('qp_8', 'qv_4', 'Amazon', '2026-08-21', -2400, 'Supplies')
]);

// --- Whatnot payout CSV ---
out('fixtures/payouts/whatnot-2026-11.csv', [
  'payout_id,date,gross,fees,shipping,net',
  'WN-8790,2026-11-01,1650.00,181.50,44.00,1424.50',
  'WN-8801,2026-11-08,1980.00,217.80,52.25,1709.95',
  'WN-8812,2026-11-15,2140.00,236.40,61.50,1842.10'
].join('\n') + '\n');
out('fixtures/payouts/bad.csv', 'payout_id,date,gross,fees,shipping,net\nWN-1,2026-11-01,100.00,10.00,5.00,90.00\nWN-2,not-a-date,1,1,1,-1\n');

// --- Fixture model answers (keyed by normalized description) ---
const one = (valueId: string, confidence: number, memo: string, reasoning: string) =>
  ({ action: 'code', lines: [{ valueId, amountCents: '$AMOUNT' }], memo, confidence, reasoning, question: null });
const k = normalizeMerchant;
out('fixtures/model/recommend.json', {
  [k('USPS PO 1234')]: one('dv_shipping', 0.97, 'USPS postage', 'Prior USPS entries were all coded Shipping & Postage; MCC 9402 is postal services.'),
  [k('AMZN Mktp US')]: { action: 'ask', lines: [], memo: 'Amazon purchase', confidence: 0.58, reasoning: 'Past Amazon purchases were coded to both Inventory and Supplies; this amount fits either.',
    question: 'Was this Amazon order inventory to resell (Inventory) or packing supplies (Supplies)? Best guess: Supplies.' },
  [`${k('WHATNOT PAYOUT WN-8812')}|184210`]: { action: 'code', lines: [
    { valueId: 'dv_sales', amountCents: 214000, description: 'Gross sales WN-8812' },
    { valueId: 'dv_platform_fees', amountCents: -23640, description: 'Whatnot fees' },
    { valueId: 'dv_shipping', amountCents: -6150, description: 'Buyer shipping labels' }],
    memo: 'Whatnot payout WN-8812', confidence: 0.91, reasoning: 'Payout row WN-8812 matches the deposit; gross, fees and shipping come from the row and sum to the deposit.', question: null },
  [k('Pirate Ship')]: one('dv_shipping', 0.82, 'Pirate Ship shipping labels', 'Pirate Ship sells discounted postage labels; MCC 4215 is courier services.'),
  [k('Canva Pro')]: one('dv_software', 0.95, 'Canva Pro subscription', 'Three prior Canva charges were coded Software & Subscriptions.'),
  [k('ULINE')]: one('dv_supplies', 0.88, 'ULINE packaging supplies', 'QuickBooks shows three Uline purchases coded Supplies; MCC 5111 fits.'),
  [k('FACEBK *ADS')]: one('dv_ads', 0.94, 'Meta ads', 'Prior Meta ad charges were coded Advertising & Marketing.'),
  [k('ShipStation')]: one('dv_software', 0.74, 'ShipStation subscription', 'ShipStation is shipping software billed monthly; no history yet.'),
  [k('Kicks Wholesale LLC')]: one('dv_inventory', 0.93, 'Kicks Wholesale inventory', 'Slash and QuickBooks history code this wholesaler to Inventory.'),
  [k('Etsy Ads')]: one('dv_ads', 0.86, 'Etsy Ads', 'Etsy Ads is marketplace advertising; MCC 7311 is advertising services.'),
  [k('Google Workspace')]: one('dv_software', 0.96, 'Google Workspace', 'Two prior charges coded Software & Subscriptions.'),
  [k('Outgoing wire fee')]: one('dv_bank_fees', 0.9, 'Wire fee', 'Prior wire fees were coded Bank Fees.'),
  [k('Shopify* Subscription')]: one('dv_software', 0.96, 'Shopify subscription', 'Four prior Shopify charges were coded Software & Subscriptions.'),
  [k('Adobe Creative Cloud')]: one('dv_software', 0.95, 'Adobe Creative Cloud', 'Prior Adobe charges were coded Software & Subscriptions.'),
  [k('Packlane')]: one('dv_supplies', 0.8, 'Packlane custom boxes', 'Packlane makes custom shipping boxes; MCC 5111 fits Supplies.'),
  [k('Book transfer from Slash Checking 4421')]: { action: 'ask', lines: [], memo: 'Transfer between own accounts', confidence: 0, reasoning: 'Looks like a transfer between own accounts, which is never coded.', question: 'Is this a transfer between your own accounts? Best guess: yes, so it should not be coded.' },
  [k('Zelle to J Smith')]: { action: 'ask', lines: [], memo: 'Zelle payment', confidence: 0, reasoning: 'Zelle to a person with no memo could be personal or a contractor.', question: 'Who is J Smith and what was the $300 for? Best guess: a personal payment (Owner\'s Draw).' },
  __default__: { action: 'ask', lines: [], memo: 'Unknown transaction', confidence: 0.2, reasoning: 'No evidence settles the account.', question: 'What was this purchase for? Best guess: unknown.' }
});
out('fixtures/model/identify.json', {
  [k('Pirate Ship')]: { kind: 'shipping', summary: 'Online postage label service (USPS/UPS discounted labels).', confidence: 0.9 },
  [k('ShipStation')]: { kind: 'software', summary: 'Shipping management software, billed monthly.', confidence: 0.85 },
  [k('Etsy Ads')]: { kind: 'ads', summary: 'Advertising on the Etsy marketplace.', confidence: 0.9 },
  [k('Packlane')]: { kind: 'supplies', summary: 'Custom printed shipping boxes and packaging.', confidence: 0.85 },
  __default__: { kind: 'unknown', summary: 'Merchant not recognized.', confidence: 0.2 }
});

// --- Seed eval cases (brief §6) ---
const ev = (id: string, kind: string, summary: string) => ({ id, kind, summary });
out('fixtures/evals/seed.json', [
  { id: 'ec_usps_history', kind: 'golden', name: 'USPS with 14 prior Shipping entries',
    input: { transaction: { description: 'USPS PO 1234', amountCents: -1840, mcc: '9402', merchantName: 'USPS PO 1234' },
      evidence: [ev('ev_1', 'slash_history', '14 prior entries from USPS PO 1234: 14× Shipping & Postage'), ev('ev_2', 'mcc', 'MCC 9402 Postal Services – Government Only')] },
    expected: { action: 'code', valueIds: ['dv_shipping'], minConfidence: 0.9, noQuestion: true } },
  { id: 'ec_pirateship_new', kind: 'golden', name: 'Pirate Ship, no history',
    input: { transaction: { description: 'Pirate Ship', amountCents: -4310, mcc: '4215', merchantName: 'Pirate Ship' }, evidence: [ev('ev_1', 'mcc', 'MCC 4215 Courier Services')] },
    expected: { action: 'code', valueIds: ['dv_shipping'], minConfidence: 0.75 } },
  { id: 'ec_amazon_split', kind: 'edge', name: 'Amazon with mixed history',
    input: { transaction: { description: 'AMZN Mktp US', amountCents: -21237, mcc: '5942', merchantName: 'AMZN Mktp US' },
      evidence: [ev('ev_1', 'slash_history', '10 prior entries from AMZN Mktp US: 6× Inventory, 4× Supplies')] },
    expected: { action: 'ask', questionMentions: ['Inventory', 'Supplies'], questionHasBestGuess: true } },
  { id: 'ec_whatnot_payout', kind: 'edge', name: 'Whatnot payout split from payout row',
    input: { transaction: { description: 'WHATNOT PAYOUT WN-8812', amountCents: 184210 },
      evidence: [ev('ev_1', 'payout_row', 'whatnot WN-8812 2026-11-15: gross 2140.00, fees 236.40, shipping 61.50, net 1842.10')], payoutMatched: true },
    expected: { action: 'code', lineCount: 3, sumCents: 184210 } },
  { id: 'ec_transfer', kind: 'refuse', name: 'Book transfer between own accounts',
    input: { transaction: { description: 'Book transfer from Slash Checking 4421', amountCents: 50000 }, evidence: [] },
    expected: { action: 'ask', noLines: true, forbidValueIds: ['dv_sales'] } },
  { id: 'ec_zelle', kind: 'refuse', name: 'Zelle to a person, no memo',
    input: { transaction: { description: 'Zelle to J Smith', amountCents: -30000 }, evidence: [] },
    expected: { action: 'ask', noLines: true } }
]);
console.log(`entries ${entries.length} (in_review ${review.length}), transactions ${transactions.length}`);
