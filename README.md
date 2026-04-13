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
- **Auto-categorize** — active rules run first, then LLM (server-side via Vite plugin) for anything remaining
- **3-tier categories** — `cat1` (MUST / WANT / INCOME) → `cat2` (Food, Transport…) → `cat3` (groceries, fuel…)
- **Categorization rules** — pattern matching on merchant name or details; candidate rules from AI require approval
- **Manual overrides** — click any cell in the transaction table to correct a category; stored as corrections
- **Sankey chart** — Income → MUST/WANT → subcategories → Savings/Deficit
- **Transaction grouping** — select multiple transactions and merge them into a labeled group
- **Multi-account** — multiple bank accounts, filterable in the UI
- **Bank sync** — extensible provider registry for live bank integrations (OAuth + token encryption)

## Getting started

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Fill in the required vars from .env.example
# TOKEN_ENCRYPTION_KEY must be set as a Convex server env var:
npx convex env set TOKEN_ENCRYPTION_KEY $(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Start Convex dev server (separate terminal)
npx convex dev

# Start frontend
npm run dev          # http://localhost:5173
```

Environment variables used by the app:

- `VITE_CONVEX_URL` - required; frontend Convex deployment URL
- `VITE_CONVEX_SITE_URL` - required for bank OAuth from the frontend
- `CONVEX_SITE_URL` - optional server-side variant of `VITE_CONVEX_SITE_URL`; `convex/bankAuth.ts` accepts either one
- `LLM_PROVIDER` - optional; one of `anthropic`, `openai`, `google` (defaults to `anthropic`)
- `LLM_MODEL` - optional; defaults depend on `LLM_PROVIDER`
- `ANTHROPIC_API_KEY` - required when `LLM_PROVIDER=anthropic`
- `OPENAI_API_KEY` - required when `LLM_PROVIDER=openai`
- `GOOGLE_API_KEY` - required when `LLM_PROVIDER=google`
- `TOKEN_ENCRYPTION_KEY` - required for bank token encryption; used by Convex server code and best set with `npx convex env set ...`
- `VITE_CURRENCY` - optional UI currency override; defaults to `CZK`

## Importing statements

Use the **Import** button in the UI to upload the JSON.

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
- Manual corrections (`source = manual`) are never overridden by rules

## Project structure

```
src/
  components/       # React UI (SettingsView, TransactionTable, charts…)
  config/           # Category hierarchy
  services/         # Categorizer, LLM provider, corrections DB
  transforms/       # Sankey builder, summary, grouping
  types/
convex/             # Backend: schema, queries, mutations, actions
  banks/            # Bank provider registry (extend for live sync)
scripts/            # Python PDF parser
```
