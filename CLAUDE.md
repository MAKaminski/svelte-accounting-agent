# CLAUDE.md — LaceLuxx Books

Read ARCHITECTURE.md first. The registries are the source of truth: `src/lib/commands.ts` (interface), `processes.yaml` (processes), `src/lib/server/db/schema.ts` (tables).

## Rules for changes

- **The ledger's own sync is the write path when it has one** (Slash). QuickBooks is written only for connections with `capabilities.code = 'qbo_direct'` (Mercury), only after a human decision, only after dedupe, always with `requestid` = decision id, and only once the owner confirmed the bank-feed setting. Never add money-movement endpoints (transfers, cards, payments) for any ledger.
- Nothing is marked ready in Slash without a recorded human decision. Auto-approval stays off (shadow mode) until ≥ 200 decisions and ≥ 98% shadow precision per account.
- Never code a transfer between own accounts or a person payment without an owner answer (rule guard + validator).
- Every Slash write carries an idempotency key and runs inside `withRun`.
- New action = registry entry → route → screen. `pnpm arch:check` fails until they exist.
- New process = card in `processes.yaml` (with `toggle` and, if switchable, `whenOff`) + a use-case trace; new external operation = a `tools:` entry. Both show up in `/system` automatically. A `judgment` step needs eval cases in `fixtures/evals/seed.json` first.
- New external call = port + fixture first; live behind a `*_MODE` switch. New ledger = a `LedgerAdapter` in `src/lib/server/ledgers/` + `CAPABILITIES` entry; never branch on kind outside the adapter.
- **Tenancy (M8).** Every tenant table has `org_id` (defaults to the session's `app.org_id`) and row-level security for `books_app`; externally derived ids use composite keys `(org_id, id)` and upserts target them. Tenant data is only read or written through `getDb()` inside `withOrg(orgId, …)` (requests: hooks; jobs: `enqueue` captures the org; scheduler: `forEachOrg`). `getRootDb()` is for orgs/users/auth only. A new tenant table → add it to `TENANT_TABLES` and regenerate `drizzle/0001_rls.sql` (`tsx scripts/gen-rls.ts`; `--check` in CI). Module-level caches must key by `currentOrgId()`.
- No polling the database: an idle app must send zero queries so Neon scales to zero (timers per pending undo window instead of a tick).
- Money is integer cents; times are UTC ISO strings. Dates in files and commits are absolute (2026-11-19, not "today").
- Secrets only in `.env` (never committed). QuickBooks tokens are encrypted with `TOKEN_ENC_KEY`.

## Narrowest test first

| Change | Run |
|---|---|
| Rules / validator / parsing | `pnpm vitest run tests/rules.test.ts` |
| Pull / research / recommend | `pnpm vitest run tests/m1-pull.test.ts tests/m2-recommend.test.ts` |
| Approve / undo / ask | `pnpm vitest run tests/m3-write.test.ts` |
| Mappings | `pnpm vitest run tests/m4-learn.test.ts` |
| Control plane / switches | `pnpm vitest run tests/m6-control.test.ts` |
| Ledger adapters / QuickBooks writes | `pnpm vitest run tests/m7-ledgers.test.ts` |
| Tenancy / RLS / audit | `pnpm vitest run tests/m8-tenancy.test.ts` |
| Prompt or model routing | `pnpm evals` (fixture) · `MODEL_MODE=live pnpm evals` (costs money) |
| UI | `pnpm test:e2e` |
| Docs | `pnpm arch:check && pnpm diagrams:check` |

## Model routing

Tier 0 rules first (cache, mapping, transfer guard, validator). `AI.merchant.identify`: Ollama if `OLLAMA_URL`, else Haiku 5.5 low. `AI.entry.recommend`: Haiku 5.5 low; Sonnet 5.5 medium only when a payout row matched. Prompts are versioned; changing one means bumping `PROMPT_VERSION` (invalidates the exact-input cache by design).
