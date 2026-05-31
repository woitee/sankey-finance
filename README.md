# Finance Tracker

Personal finance dashboard for Czech bank accounts. Parses bank statements, auto-categorizes transactions via rules and AI, and visualizes spending as a Sankey flow chart.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + TypeScript + Vite |
| Database | Convex (reactive, serverless) |
| Charts | ECharts (`echarts-for-react`) |
| AI | Vercel AI SDK (`ai`) — Anthropic / OpenAI / Google |
| PDF parsing | Python + pdfplumber |

## Features

- **Import** — PDF bank statements (Air Bank CZ, CSOB CZ) via built-in PDF parsers; AI-assisted parser for other formats
- **Auto-categorize** — active rules run first, then LLM (via Convex action) for anything remaining
- **3-tier categories** — `cat1` (MUST / WANT / INCOME) → `cat2` (Food, Transport…) → `cat3` (groceries, fuel…)
- **Categorization rules** — pattern matching on merchant name or details; candidate rules from AI require approval
- **Manual overrides** — click any cell in the transaction table to edit a category directly
- **Sankey chart** — Income → MUST/WANT → subcategories → Savings/Deficit
- **Transaction grouping** — select multiple transactions and merge them into a labeled group
- **Multi-account** — multiple bank accounts, filterable in the UI
- **Bank sync** — extensible provider registry for live bank integrations (OAuth + token encryption)

## Prerequisites

- **Node.js 18+**

## Getting started

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Fill in VITE_CONVEX_URL, VITE_CONVEX_SITE_URL, and any API keys

# Push server-side env vars to Convex (reads non-VITE_ vars from .env.local)
npm run env:push

# Start everything (Convex + frontend)
npm start            # http://localhost:5173

# Or start them separately
npx convex dev
npm run dev
```

### Environment variables (`.env.local`)

All config lives in `.env.local`. Variables prefixed with `VITE_` are used by the frontend (bundled into the browser). Everything else is server-side and gets pushed to Convex with `npm run env:push`.

| Variable | Side | Required | Description |
|----------|------|----------|-------------|
| `VITE_CONVEX_URL` | frontend | yes | Convex deployment URL |
| `VITE_CONVEX_SITE_URL` | frontend | for bank OAuth | Convex HTTP actions URL |
| `VITE_CURRENCY` | frontend | no | UI currency symbol (default: `CZK`) |
| `AUTH_PROVIDER` | server | for auth | Set to `clerk` to enforce backend auth |
| `VITE_CLERK_PUBLISHABLE_KEY` | frontend | for auth | Clerk publishable key (`pk_...`) |
| `CLERK_ISSUER_URL` | server | for auth | Clerk issuer URL |
| `ANTHROPIC_API_KEY` | server | for LLM | Anthropic API key (default provider) |
| `OPENAI_API_KEY` | server | for LLM | OpenAI API key |
| `GOOGLE_API_KEY` | server | for LLM | Google AI API key |
| `LLM_PROVIDER` | server | no | `anthropic` (default), `openai`, or `google` |
| `LLM_MODEL` | server | no | Model override |
| `TOKEN_ENCRYPTION_KEY` | server | for bank sync | AES-256-GCM key (64 hex chars) |

## Authentication (optional)

Auth is **disabled by default** — the app runs wide open, which is fine for local use. To gate the app behind a login:

1. Create a [Clerk](https://clerk.com) application (free tier is fine for personal use)
2. In the Clerk Dashboard, activate the **Convex** integration (JWT Templates → Convex, or Integrations → Convex). Without this, Clerk won't issue JWTs that Convex can validate.
3. Add all three lines to `.env.local`:
   ```
   AUTH_PROVIDER=clerk
   VITE_CLERK_PUBLISHABLE_KEY=pk_...
   CLERK_ISSUER_URL=https://your-app.clerk.accounts.dev
   ```
4. Push the server-side var to Convex:
   ```bash
   npm run env:push
   ```

Auth is derived from these variables — no separate "enable auth" flag. Remove both lines to go back to open mode.

When enabled, this protects:
- **Frontend** — shows a Clerk sign-in screen; unauthenticated users can't see the app
- **Convex** — JWTs validated via `convex/auth.config.ts`; all backend functions (including LLM actions) are protected

The auth layer is pluggable — see `src/auth/types.ts` for the provider interface. To add a new provider (e.g. Auth0), create `src/auth/<name>.tsx` and add a case in `main.tsx`.

## Self-hosting Convex (optional)

By default the app uses [Convex Cloud](https://convex.dev) — just run `npx convex dev` and it handles everything. If you prefer to run the backend yourself, Convex is [open-source and self-hostable](https://github.com/get-convex/convex-backend).

**Requirements:** Docker

```bash
# Download docker-compose.yml from the Convex repo
curl -O https://raw.githubusercontent.com/get-convex/convex-backend/main/self-hosted/docker-compose.yml

# Start the backend + dashboard
docker compose up -d

# Generate an admin key
docker compose exec backend ./generate_admin_key.sh
```

Then configure your project to point at the local backend instead of the cloud. In `.env.local`:

```
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=<your admin key>
VITE_CONVEX_URL=http://127.0.0.1:3210
VITE_CONVEX_SITE_URL=http://127.0.0.1:3211
```

The self-hosted dashboard is available at `http://localhost:6791`. See the [self-hosting guide](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md) for production storage options (Postgres, S3, etc.).

## Importing statements

Use the **Import** button in the UI to upload a PDF.

**Built-in PDF import:**

- Air Bank CZ
- CSOB CZ

For other banks, use the **Import → AI parser** option in the UI.

## Category system

Defined in `src/config/categories.ts`. Each `cat3` maps to a fixed `cat2` + `cat1`:

```
MUST  → Living   → rent, utilities_gas, internet, …
MUST  → Food     → groceries
MUST  → Health   → pharmacy, doctor, …
WANT  → Food     → restaurant, cafe, food_delivery, …
WANT  → Leisure  → streaming, sport, …
INCOME → …       → salary, cashback, refund, …
```

## Categorization rules

Rules live in Settings → Active Rules. Each rule matches a **pattern** against `merchantName` or `details` using `contains` / `exact` / `startsWith`.

- **Active rules** apply automatically on import and via "Rerun all rules"
- **Candidate rules** are AI suggestions awaiting approval; they apply immediately to new transactions but revert to `llm` source if rejected or deleted
- Manual edits (`source = manual`) are never overridden by rules

## Project structure

```
src/
  auth/             # Pluggable auth layer (none, clerk)
  components/       # React UI (SettingsView, TransactionTable, charts…)
  config/           # Category hierarchy
  parsers/          # Bank statement parsers (Air Bank, CSOB, LLM fallback)
  services/         # Categorizer, LLM provider (calls Convex actions)
  transforms/       # Sankey builder, summary, grouping
  types/
convex/             # Backend: schema, queries, mutations, actions
  llm.ts            # AI categorization + statement parsing (Node.js actions)
  banks/            # Bank provider registry (extend for live sync)
scripts/            # Python PDF parser
```
