# Project Finance

Personal finance tracker — parses Czech bank statements, categorizes transactions, visualizes via Sankey chart.

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Backend**: Convex (reactive, serverless)
- **Charts**: ECharts (`echarts-for-react`)
- **AI**: Vercel AI SDK — Anthropic / OpenAI / Google (via Convex actions)
- **PDF parsing**: Python + pdfplumber (legacy), browser-side parsers (Air Bank, CSOB)

## Commands

```bash
npm start              # Convex + Vite dev server (port 5173)
npm run dev            # Vite only
npx convex dev         # Convex only
npm run env:push       # Push server-side env vars from .env.local to Convex
npx tsc --noEmit       # Type-check
```

## Environment Variables

All config lives in `.env.local` — single source of truth.

- **`VITE_*` vars** are bundled into the browser by Vite.
- **Everything else** is server-side and gets pushed to Convex with `npm run env:push`.
- **Never use `npx convex env set` directly** — always add vars to `.env.local` and run `npm run env:push`.

### Auth

Auth is controlled by `AUTH_PROVIDER`:
- Set `AUTH_PROVIDER=clerk` + `VITE_CLERK_PUBLISHABLE_KEY` + `CLERK_ISSUER_URL` to enable Clerk auth.
- Remove all three to run without auth.
- The backend will fail hard if `AUTH_PROVIDER=clerk` is set without `CLERK_ISSUER_URL`.

## Architecture

- `src/config/categories.ts` — cat3 → cat2 → cat1 hierarchy (source of truth)
- `convex/lib/auth.ts` — authenticated wrappers (`authenticatedQuery`, `authenticatedMutation`, `authenticatedAction`) using `convex-helpers/server/customFunctions`
- `convex/auth.config.ts` — Convex JWT provider config (conditional on `CLERK_ISSUER_URL`)
- `src/auth/` — pluggable frontend auth (clerk, none)
- `scripts/env-push.mjs` — reads `.env.local`, pushes non-VITE_ vars to Convex
