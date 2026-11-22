// Where each ledger's API key lives. Shared by the server (errors, connection view) and the Ledgers screen.
export type KeyedLedger = 'slash' | 'mercury';
export const KEY_HELP: Record<KeyedLedger, { label: string; where: string; url: string; note: string }> = {
  slash: {
    label: 'Slash API key', where: 'Slash dashboard → Settings → Developer → API keys', url: 'https://app.slash.com/settings/developer',
    note: 'Multi-entity Slash account? Also paste the legal entity id shown on the same page.'
  },
  mercury: {
    label: 'Mercury API token', where: 'Mercury → Settings → Tokens → Add API token', url: 'https://app.mercury.com/settings/tokens',
    note: 'Read-only is enough: the app pulls transactions and adds a note; it never moves money.'
  }
};
