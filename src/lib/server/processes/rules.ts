// Tier 0 rules: deterministic, unit-tested, $0. Used by research, recommend and validate.
export type TxKind = 'own_transfer' | 'p2p' | 'payout' | 'card' | 'other';

export function classifyTxKind(description: string, hasMerchant: boolean): TxKind {
  const d = description.toLowerCase();
  if (/\b(book transfer|internal transfer|transfer (from|to) (slash|checking|savings|my|own))\b/.test(d)) return 'own_transfer';
  if (/\b(zelle|venmo|cash app|cashapp)\b/.test(d)) return 'p2p';
  if (/\bpayout\b/.test(d)) return 'payout';
  return hasMerchant ? 'card' : 'other';
}

/** Common merchant category codes for small businesses. Unknown codes stay unknown (never guessed). */
export const MCC: Record<string, { label: string; hint: string }> = {
  '9402': { label: 'Postal Services – Government Only', hint: 'Shipping & Postage' },
  '4215': { label: 'Courier Services', hint: 'Shipping & Postage' },
  '5111': { label: 'Stationery, Office & School Supply', hint: 'Supplies' },
  '5942': { label: 'Book Stores (Amazon marketplace)', hint: 'ambiguous: Inventory or Supplies' },
  '5734': { label: 'Computer Software Stores', hint: 'Software & Subscriptions' },
  '7311': { label: 'Advertising Services', hint: 'Advertising & Marketing' },
  '5139': { label: 'Commercial Footwear (wholesale)', hint: 'Inventory' },
  '5691': { label: "Men's and Women's Clothing", hint: 'Inventory' }
};

export const PAYOUT_AMOUNT_TOLERANCE_CENTS = 1;
export const PAYOUT_DATE_TOLERANCE_DAYS = 3;
export const MAPPING_MIN_SUPPORT = 3;
