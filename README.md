# SplitWisest

**Live:** https://splitwisest-kappa.vercel.app

A private, friend-group expense tracker inspired by Splitwise. Track shared expenses, see who owes who, simplify debts, record offline settlements, and chat in context. **Not a payment app** — no bank connections, cards, or payment processing; settlements are ledger records of payments that happened offline.

## Features

- Username/password auth (scrypt-hashed, session cookies), optional invite-code onboarding
- Groups (trips, apartments, dinners, bills) with per-group currency
- Expenses with equal / exact / percentage / shares / itemized splits, categories (incl. custom), notes, receipt attachments
- Multi-currency with automatic conversion (rates snapshotted per expense)
- Group + friend balances with exact minimum-payment plans for up to 18 active balances
- Offline settlement recording (group or direct between friends)
- Recurring expenses (weekly/monthly, lazily materialized)
- Search & filtering by group, friend, date, category, payer, text
- Activity log (grouped by day), CSV export, SVG charts
- Group chat + direct friend chat with link rendering and search
- Realtime via lightweight polling sync cursor (serverless-friendly)
- Modern, clean, minimal UI from a single design-token system — flat surfaces, one sans typeface, tabular money; light + dark theme toggle in the sidebar, mobile header, and Settings — persists and respects OS preference
- PWA manifest, responsive from small phones to ultrawide

## Stack

Next.js (App Router, TypeScript), Tailwind CSS v4, Lucide icons, Neon PostgreSQL via `@neondatabase/serverless`, Zod validation, Vitest.

## Setup

```bash
pnpm install
# .env.local needs DATABASE_URL (SIGNUP_CODE is optional)
pnpm tsx scripts/migrate.ts  # create tables (idempotent)
pnpm dev
```

No hosted Neon account? You can run entirely against a local Postgres via a small
Neon-HTTP proxy — see **docs/DATABASE.md → "Local Postgres"** (the `NEON_LOCAL_PROXY`
escape hatch, inert in production).

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (pooler URL, `sslmode=require`) |
| `SIGNUP_CODE` | Optional bootstrap invite code. Friend and group invite codes also work during signup. |

## Testing

```bash
pnpm vitest run      # money math + unit tests
pnpm tsc --noEmit    # typecheck
pnpm next build      # production build
```

Browser/E2E verification is done with `agent-browser` across mobile portrait, mobile landscape, tablet, desktop, and wide viewports.

## Deployment (Vercel)

```bash
vercel --prod
```

Set `DATABASE_URL` in Vercel project env vars. Add `SIGNUP_CODE` only if you want a bootstrap invite code. Run the migration once against the production database before first use.

## Documentation

- `docs/ARCHITECTURE.md` — auth, balance math, settlements, realtime, chat, deployment
- `docs/DATABASE.md` — schema and migration notes for Neon
- `docs/USAGE.md` — user-facing workflow guide
