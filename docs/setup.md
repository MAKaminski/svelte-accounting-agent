# Setup and commands

Everything runs on fixtures by default (synthetic ledger, QuickBooks and model data), so the UI, CLI, tests and evals work with no keys.

## Going live

1. `cp .env.example .env` and set `TOKEN_ENC_KEY` (`openssl rand -base64 32`). Leave `AUTH_GOOGLE_ID` empty for the local dev bypass (you are owner@local); set the Google client + `AUTH_SECRET` to test real sign-in.
2. Slash: create an API key with the narrowest permissions (Slash dashboard → Settings → Developer), set `SLASH_API_KEY`, `SLASH_LEGAL_ENTITY_ID`, `SLASH_MODE=live`. Run `pnpm books coa pull` then `pnpm books entries pull --dry-run`.
3. Models: set `ANTHROPIC_API_KEY` (https://console.anthropic.com/settings/keys), `MODEL_MODE=live`, then `pnpm books evals run`.
4. Mercury: `/ledgers` → Add connection (or `printf %s "$TOKEN" | pnpm books ledger add --kind mercury --name Mercury --mode live --token-stdin`) with a read-only token from https://app.mercury.com/settings/tokens. Turn off Mercury's own QuickBooks sync for these accounts, map each account to its QuickBooks bank account, confirm, then activate.
5. QuickBooks: create an Intuit app (https://developer.intuit.com/app/developer/dashboard), set `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_MODE=live`, then Settings → Connect QuickBooks.
6. Optional: `PULL_INTERVAL_MIN=60` for hourly pulls; `OLLAMA_URL` to identify unknown merchants locally.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | App on :5173 |
| `pnpm books <noun> <verb>` | CLI (needs the app running); `--json` for machine output |
| `pnpm test` | Unit + process tests (fixtures, in-memory Postgres via PGlite, running as `books_app` under RLS) |
| `pnpm test:e2e` | Playwright against a seeded dev server on :5174 |
| `pnpm evals` | Eval cases, in-process; exit 1 on any failure |
| `pnpm org:invite <email> [role]` | Bootstrap: invite the first owner of a deployment (accepted on first Google sign-in) |
| `pnpm arch` / `pnpm arch:check` | Regenerate / verify ARCHITECTURE.md from the registries |
| `pnpm diagrams:check` | Render every Mermaid diagram with mmdc |
| `pnpm build && pnpm start` | Production server (`node build`) + `dist/books.mjs` |
| `docker compose up` | One container, `./data` mounted, 0.5 vCPU / 512Mi |

## Layout

| Path | Holds |
|---|---|
| `src/lib/commands.ts` | The command registry: CLI, palette, shortcuts, routes and docs come from it |
| `processes.yaml` | Process cards, tools, switches (`toggle`/`whenOff`), interactions, use-case traces — rendered live at `/system` |
| `src/lib/server/processes/` | One handler per process (pull, research, recommend, decide, mappings, payouts, evals) |
| `src/lib/server/{slash,qbo}.ts`, `ai/model.ts` | External ports with live + fixture implementations |
| `src/lib/server/prompts/` | Versioned prompts (`recommend.v1`, `identify.v1`) |
| `fixtures/` | Synthetic data; regenerate with `pnpm tsx scripts/make-fixtures.ts` |
| `ARCHITECTURE.md` | ERD, architecture, sequences, process directory, operating envelope |

See ARCHITECTURE.md for the design and the measured operating envelope.
