# Finance Tracker

Personal finance dashboard for Czech bank accounts. Parses bank statements, auto-categorizes transactions via rules and AI, and visualizes spending as a Sankey flow chart.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + TypeScript + Vite |
| Database | Convex (reactive, serverless) |
| Charts | ECharts (`echarts-for-react`) |
| AI | Claude Haiku (`@anthropic-ai/sdk`) |
| PDF parsing | Python + pdfplumber |

## Features

- **Import** — PDF bank statements (Air Bank CZ) via Python parser; AI-assisted parser for other formats
- **Auto-categorize** — active rules run first, then Claude Haiku for anything remaining
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
# Fill in VITE_CONVEX_URL, VITE_CONVEX_SITE_URL, VITE_ANTHROPIC_API_KEY
# TOKEN_ENCRYPTION_KEY must be set as a Convex server env var:
npx convex env set TOKEN_ENCRYPTION_KEY $(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Start Convex dev server (separate terminal)
npx convex dev

# Start frontend
npm run dev          # http://localhost:5173
```

## Importing statements

**Air Bank PDF:**
```bash
python scripts/parse_statement.py path/to/statement.pdf --output data/parsed/2025-03.json
```
Then use the **Import** button in the UI to upload the JSON.

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
