# Run your own server

This guide is for whoever operates the server. People who **use** the app don't need any of this: they sign in, create a company, and paste their own Slash or Mercury key in the app (see the README).

Everything runs on fixtures by default (synthetic ledger, QuickBooks and model data), so the UI, CLI, tests and evals work with no keys.

## What the server needs (once, for every company)

| Setting | What it is | Where you get it |
|---|---|---|
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign-in for your users | [Google Cloud → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials). OAuth client (Web), redirect URI `https://<host>/auth/callback/google` |
| `AUTH_SECRET` | Signs session cookies | `openssl rand -base64 32` |
| `TOKEN_ENC_KEY` | Encrypts every company's ledger keys and QuickBooks tokens. **Never change it** after users connect: stored keys become unreadable | `openssl rand -base64 32` |
| `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENV` | Your Intuit app; each company then signs in to its own QuickBooks with it | [Intuit developer dashboard](https://developer.intuit.com/app/developer/dashboard) → your app → Keys & credentials. Redirect URI `https://<host>/api/qbo/callback`; `QBO_ENV=production` for real companies |
| `QBO_MODE=live` | Real companies use their connected QuickBooks; the demo company keeps sample data | — |
| `ANTHROPIC_API_KEY`, `MODEL_MODE=live` | The model behind recommendations (billed to you, the operator) | [Anthropic Console → API keys](https://console.anthropic.com/settings/keys) |
| `SIGNUP_MODE` | `open` (default): anyone with a Google account can create a company. `invite`: only invited emails | — |
| `DATABASE_URL`, `DATABASE_URL_OWNER` | Postgres. Neon: use the **direct** (non-pooled) endpoint | [Neon console](https://console.neon.tech) → project → Connect |

Users' Slash and Mercury keys are **not** server settings. Each company enters its own keys in the app. `SLASH_API_KEY` and `SLASH_MODE=live` exist only for a single-company self-host that wants to skip that step.

**Cost guard:** with `SIGNUP_MODE=open` and `MODEL_MODE=live`, every new company's recommendations are billed to your Anthropic key. Set a spend limit in the Anthropic Console, or use `SIGNUP_MODE=invite` and `pnpm org:invite <email> owner`.

## Local

1. `cp .env.example .env` and set `TOKEN_ENC_KEY`. Leave `AUTH_GOOGLE_ID` empty for the local dev bypass (you are owner@local of the demo company).
2. `pnpm i && pnpm db:reset && pnpm db:seed && pnpm dev`, then open http://localhost:5173.
3. To test a real ledger, go to `/ledgers` → Add connection → paste the key. CLI equivalent: `printf %s "$TOKEN" | pnpm books ledger add --kind mercury --name Mercury --mode live --token-stdin`.
4. Models: set `ANTHROPIC_API_KEY` and `MODEL_MODE=live`, then run `pnpm books evals run`.

## Fly.io + Neon

```bash
fly apps create svelte-accounting-agent
fly secrets set -a svelte-accounting-agent DATABASE_URL=… DATABASE_URL_OWNER=… TOKEN_ENC_KEY=… AUTH_SECRET=… AUTH_GOOGLE_ID=… AUTH_GOOGLE_SECRET=… QBO_CLIENT_ID=… QBO_CLIENT_SECRET=… ANTHROPIC_API_KEY=…
fly deploy --ha=false -a svelte-accounting-agent
```

`fly.toml` sets the non-secret settings (`AUTH_URL`, `QBO_REDIRECT_URI`, modes). Migrations run as the release command before each version takes traffic.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | App on :5173 |
| `pnpm books <noun> <verb>` | CLI (needs the app running); `--json` for machine output |
| `pnpm test` | Unit + process tests (fixtures, in-memory Postgres via PGlite, running as `books_app` under RLS) |
| `pnpm test:e2e` | Playwright against a seeded dev server on :5174 |
| `pnpm evals` | Eval cases, in-process; exit 1 on any failure |
| `pnpm org:invite <email> [role]` | Invite-only servers: invite an owner (accepted on first Google sign-in) |
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
| `src/lib/server/prompts/` | Versioned prompts (`recommend.v2`, built from each company's profile; `identify.v1`) |
| `fixtures/` | Synthetic data; regenerate with `pnpm tsx scripts/make-fixtures.ts` |
| `ARCHITECTURE.md` | ERD, architecture, sequences, process directory, operating envelope |

See ARCHITECTURE.md for the design and the measured operating envelope.
