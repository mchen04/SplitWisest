# Architecture

## Layers

- `src/lib/` — pure logic and data access: `money.ts` (split math, debt simplification), `balances.ts` (balance queries), `settlements.ts` (settlement validation, visibility, authorization), `expenses.ts` (expense write paths + recurring materialization), `auth.ts` (passwords, sessions), `attachments.ts` (safe upload/download filenames), `fx.ts` (currency rates), `api.ts` (route error handling), `activity.ts` (log writes), `db.ts` (Neon client), `client.ts` (browser fetch + polling hooks).
- `src/app/api/` — REST route handlers. Every handler authenticates via session cookie and authorizes via group membership / friendship checks before touching data.
- `src/app/` + `src/components/` — client-rendered UI. Pages fetch JSON from the API; no server components touch the DB directly.

## Auth

- Passwords hashed with Node `scrypt` (16-byte random salt, 64-byte key), stored as `scrypt:<salt>:<hash>`. Verification uses `timingSafeEqual`.
- Sessions: 32-byte random token in an httpOnly, SameSite=Lax cookie, stored server-side in `sessions` with 30-day expiry. Logout deletes the row.
- Signup is open by default. If an invite code is supplied, it must match `SIGNUP_CODE`, another user's personal code, or a group invite code; personal and group codes also connect the new user to the inviter or group.
- Password recovery consumes the one-time recovery code, updates the password hash, and invalidates existing sessions in one CTE-backed database statement; the replacement login session is created only after that atomic reset succeeds.

## Money

- All amounts are integer cents. Splits use floor + largest-remainder distribution so shares always sum exactly to the total (`src/lib/money.ts`, covered by Vitest).
- Each expense stores `amount_cents` in its own currency plus `converted_cents` in the group currency, converted at entry time (`fx_rate` snapshot). Later rate changes never alter recorded balances.
- Group balance per member = paid − owed + settlements paid − settlements received, all in group currency. Share conversion rounding drift (a few cents at most) is absorbed into the largest balance so nets always sum to zero.
- Debt simplification (`simplifyDebts`) greedily matches largest debtor to largest creditor, yielding ≤ n−1 transfers.
- Friend balances mirror the app's simplified settle-up suggestions across shared groups, plus direct settlements, reported per currency without cross-currency netting. Pair balances are aggregated across all relevant groups in one set-based query before per-group debt simplification, avoiding one full balance query per shared group.

## Settlements

Settlements are ledger rows only (payer, recipient, amount, date, note) — no money movement. Group settlements convert to group currency; direct friend settlements stay in their own currency. Mutating a direct settlement requires being a payer or recipient; mutating a group settlement requires current group membership plus being the payer, recipient, or creator.

## Activity visibility

Group activity is visible through group membership. User-scoped activity, such as friend acceptance/removal and direct settlements, is logged with explicit `visibleUserIds` so both affected users get feed visibility and sync cursor updates.

## Attachments

Receipt uploads are limited to images/PDFs under 4 MB. Stored filenames are canonicalized to remove path separators, quotes, and control characters; downloads emit a safe `Content-Disposition` header with both `filename` and `filename*`.

## Realtime

`GET /api/sync` returns visible cursors for activity, messages, nudges, and friend requests, plus unread counts for messages, activity, nudges, requests, and the aggregate Balances badge. The client polls every 4s (16s when the tab is hidden) via `useSync`; when any cursor advances, affected views refetch and chat panes fetch messages `since` their last id. Activity and message scopes clear through `read_state`; nudges clear via `seen_at`; friend requests clear when accepted/declined/canceled. No websockets — reliable on serverless, no connection state to break.

## Chat

`messages` rows are either `group` (group_id) or `dm` (ordered user pair). Both endpoints support `since` incremental fetch and `q` substring search. Links render as anchors; everything else is plain text (React escapes by default).

## Recurring expenses

`recurring_expenses` hold a template + `next_date`. When a group page is loaded, `materializeRecurring` creates concrete expenses for every elapsed period (capped) and advances `next_date` — no cron needed.

## Theming

The design system ships in two palettes. Light is the warm "ledger paper" default; dark is a dim variant defined in `src/app/globals.css` under `[data-theme="dark"]`, which overrides the `--color-*` design tokens (and `--shadow-*`, paper-grain, skeleton) so every `bg-paper`/`text-ink`/`bg-accent` utility flips automatically — no per-component dark variants. Accent and danger backgrounds use dedicated `--color-on-accent` / `--color-on-danger` foreground tokens so text stays legible in both themes. `src/lib/theme.tsx` exposes `useTheme()` (toggle wired into the sidebar, mobile header, and Settings → Appearance) and `themeInitScript`, an inline `<head>` script that applies the saved theme (or the OS `prefers-color-scheme`) before first paint to avoid a flash. The choice persists in `localStorage`.

## Deployment

Vercel serverless. Neon over HTTP (`@neondatabase/serverless`), so write paths prefer single-statement CTEs where atomicity matters and otherwise order writes so a mid-sequence failure leaves either a complete record or a cleanly absent one.
