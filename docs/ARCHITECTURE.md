# Architecture

## Layers

- `src/lib/` — pure logic and data access: `money.ts` (split math, debt simplification), `balances.ts` (balance queries), `expenses.ts` (expense write paths + recurring materialization), `auth.ts` (passwords, sessions), `fx.ts` (currency rates), `api.ts` (route error handling), `activity.ts` (log writes), `db.ts` (Neon client), `client.ts` (browser fetch + polling hooks).
- `src/app/api/` — REST route handlers. Every handler authenticates via session cookie and authorizes via group membership / friendship checks before touching data.
- `src/app/` + `src/components/` — client-rendered UI. Pages fetch JSON from the API; no server components touch the DB directly.

## Auth

- Passwords hashed with Node `scrypt` (16-byte random salt, 64-byte key), stored as `scrypt:<salt>:<hash>`. Verification uses `timingSafeEqual`.
- Sessions: 32-byte random token in an httpOnly, SameSite=Lax cookie, stored server-side in `sessions` with 30-day expiry. Logout deletes the row.
- Signup requires an invite code: either the app `SIGNUP_CODE` or another user's personal code (which also creates the friendship). Joining a group auto-friends its members.

## Money

- All amounts are integer cents. Splits use floor + largest-remainder distribution so shares always sum exactly to the total (`src/lib/money.ts`, covered by Vitest).
- Each expense stores `amount_cents` in its own currency plus `converted_cents` in the group currency, converted at entry time (`fx_rate` snapshot). Later rate changes never alter recorded balances.
- Group balance per member = paid − owed + settlements paid − settlements received, all in group currency. Share conversion rounding drift (a few cents at most) is absorbed into the largest balance so nets always sum to zero.
- Debt simplification (`simplifyDebts`) greedily matches largest debtor to largest creditor, yielding ≤ n−1 transfers.
- Friend balances are pairwise (debtor→creditor per expense share + direct settlements), reported per currency without cross-currency netting.

## Settlements

Settlements are ledger rows only (payer, recipient, amount, date, note) — no money movement. Group settlements convert to group currency; direct friend settlements stay in their own currency.

## Realtime

`GET /api/sync` returns the max visible activity id and message id for the user. The client polls every 4s (16s when the tab is hidden) via `useSync`; when a cursor advances, affected views refetch and chat panes fetch messages `since` their last id. No websockets — reliable on serverless, no connection state to break.

## Chat

`messages` rows are either `group` (group_id) or `dm` (ordered user pair). Both endpoints support `since` incremental fetch and `q` substring search. Links render as anchors; everything else is plain text (React escapes by default).

## Recurring expenses

`recurring_expenses` hold a template + `next_date`. When a group page is loaded, `materializeRecurring` creates concrete expenses for every elapsed period (capped) and advances `next_date` — no cron needed.

## Deployment

Vercel serverless. Neon over HTTP (`@neondatabase/serverless`), which means no multi-statement transactions; write paths are ordered so a mid-sequence failure leaves either a complete record or a cleanly absent one (expense row first, then shares; reads tolerate orphans by joining through shares).
