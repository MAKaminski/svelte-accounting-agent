# CLAUDE.md — LaceLuxx Books

Read ARCHITECTURE.md first. The registries are the source of truth: `src/lib/commands.ts` (interface), `processes.yaml` (processes), `src/lib/server/db/schema.ts` (tables).

## Rules for changes

- **Slash is the only write path.** Never add QuickBooks writes or any Slash money-movement endpoint (transfers, cards, payments).
- Nothing is marked ready in Slash without a recorded human decision. Auto-approval stays off (shadow mode) until ≥ 200 decisions and ≥ 98% shadow precision per account.
- Never code a transfer between own accounts or a person payment without an owner answer (rule guard + validator).
- Every Slash write carries an idempotency key and runs inside `withRun`.
- New action = registry entry → route → screen. `pnpm arch:check` fails until they exist.
- New process = card in `processes.yaml` (with `toggle` and, if switchable, `whenOff`) + a use-case trace; new external operation = a `tools:` entry. Both show up in `/system` automatically. A `judgment` step needs eval cases in `fixtures/evals/seed.json` first.
- New external call = port + fixture first; live behind a `*_MODE` switch.
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
| Prompt or model routing | `pnpm evals` (fixture) · `MODEL_MODE=live pnpm evals` (costs money) |
| UI | `pnpm test:e2e` |
| Docs | `pnpm arch:check && pnpm diagrams:check` |

## Model routing

Tier 0 rules first (cache, mapping, transfer guard, validator). `AI.merchant.identify`: Ollama if `OLLAMA_URL`, else Haiku 5.5 low. `AI.entry.recommend`: Haiku 5.5 low; Sonnet 5.5 medium only when a payout row matched. Prompts are versioned; changing one means bumping `PROMPT_VERSION` (invalidates the exact-input cache by design).
