# SplitWisest

A private, friend-group expense tracker inspired by Splitwise. Track shared expenses, see who owes who, simplify debts, record offline settlements, and chat in context. **Not a payment app** — no bank connections, cards, or payment processing; settlements are ledger records of payments that happened offline.

## Features

- Username/password auth (scrypt-hashed, session cookies), invite-code-gated signup
- Groups (trips, apartments, dinners, bills) with per-group currency
- Expenses with equal / exact / percentage / shares / itemized splits, categories (incl. custom), notes, receipt attachments
- Multi-currency with automatic conversion (rates snapshotted per expense)
- Group + friend balances, greedy debt simplification ("fewest practical payments")
- Offline settlement recording (group or direct between friends)
- Recurring expenses (weekly/monthly, lazily materialized)
- Search & filtering by group, friend, date, category, payer, text
- Activity log (calm timestamped rows), CSV export, SVG charts
- Group chat + direct friend chat with link rendering and search
- Realtime via lightweight polling sync cursor (serverless-friendly)
- PWA manifest, responsive from small phones to ultrawide

## Stack

Next.js (App Router, TypeScript), Tailwind CSS v4, Lucide icons, Neon PostgreSQL via `@neondatabase/serverless`, Zod validation, Vitest.

## Setup

```bash
pnpm install
# .env.local needs DATABASE_URL and SIGNUP_CODE (see below)
pnpm tsx scripts/migrate.ts  # create tables (idempotent)
pnpm dev
```

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (pooler URL, `sslmode=require`) |
| `SIGNUP_CODE` | Bootstrap invite code for the first account(s). After that, users invite each other with personal codes. |

## Testing

```bash
pnpm vitest run      # money math + unit tests
pnpm tsc --noEmit    # typecheck
pnpm next build      # production build
```

Browser/E2E verification is done with `agent-browser` across mobile portrait, mobile landscape, tablet, desktop, and wide viewports (see `docs/QA.md`).

## Deployment (Vercel)

```bash
vercel --prod
```

Set `DATABASE_URL` and `SIGNUP_CODE` in Vercel project env vars. Run the migration once against the production database before first use.

## Documentation

- `docs/ARCHITECTURE.md` — auth, balance math, settlements, realtime, chat, deployment
- `docs/DATABASE.md` — schema and migration notes for Neon
- `docs/USAGE.md` — user-facing workflow guide
- `docs/QA.md` — QA checklist and verification results
