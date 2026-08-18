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
- Auth endpoints are rate-limited by both IP and account (120 / 8 per 15-min window) via a single-statement upsert into `auth_rate_limits`; the account key is the normalized username (un-spoofable), and the client IP is read from the platform-trusted `x-vercel-forwarded-for` / `x-real-ip` headers (falling back to the right-most `x-forwarded-for` hop) so a forged left-most `x-forwarded-for` can't mint a fresh IP bucket per request.
- Defense-in-depth CSRF: the shared `handler` wrapper rejects any non-GET request whose browser `Origin` header doesn't match the request host. `SameSite=Lax` already withholds the cookie cross-site; header-less server/API clients (no `Origin`) are unaffected.

## Money

- All amounts are integer cents. Splits use floor + largest-remainder distribution so shares always sum exactly to the total (`src/lib/money.ts`, covered by Vitest).
- Each expense stores `amount_cents` in its own currency plus `converted_cents` in the group currency, converted at entry time (`fx_rate` snapshot). Later rate changes never alter recorded balances. `getRatesPerUsd` merges the static fallback under cached/live rates so a code missing from the upstream feed still resolves instead of failing conversion.
- Zero-decimal currencies (JPY/KRW) have no minor unit: amounts are snapped to whole units at entry and in `convert()`, and splits distribute whole units, so a share is never an unpayable fraction of a yen/won. Exact splits reject fractional-cent inputs rather than silently rounding.
- Group balance per member = paid − owed + settlements paid − settlements received, all in group currency, computed by the `group_balance_rows(group_id)` SQL function. The owed side allocates each expense's `converted_cents` across its shares with a per-expense largest-remainder pass (exact integer `div`/`mod`), so converted shares sum exactly to the expense total and no cross-currency rounding residual is misattributed to one member; a whole-group residual-absorption step remains as a defensive backstop. The invariant `SUM(share_cents) = amount_cents` is enforced at the DB by a deferred constraint trigger.
- Debt simplification (`simplifyDebts`) finds the exact minimum payment count for up to 18 active balances. It partitions balances into the largest possible number of zero-sum sets. Larger groups use the deterministic largest-debtor/largest-creditor fallback.
- Friend and people-profile balances use the same optimized group plans shown on group pages. Each obligation keeps its group and currency, so offsetting groups stay visible and friend-page payments are recorded in the correct group. Group-less payments remain separate direct obligations.

## Settlements

Settlements are ledger rows only (payer, recipient, amount, date, note) — no money movement. Group settlements convert to group currency; direct friend settlements stay in their own currency. Recording any settlement (group or direct) requires the actor to be the payer or recipient, so a member can't fabricate a payment between two other people. Mutating a direct settlement requires being a payer or recipient; mutating a group settlement requires current group membership plus being the payer, recipient, or creator.

## Activity visibility

Group activity is visible through group membership. User-scoped activity, such as friend acceptance/removal and direct settlements, is logged with explicit `visibleUserIds` so both affected users get feed visibility and sync cursor updates.

## Attachments

Receipt uploads are limited to images/PDFs under 4 MB and validated by magic-byte signature (not just the declared MIME), so a script payload posing as an image is rejected at upload. Stored filenames are canonicalized to remove path separators, quotes, and control characters; downloads emit a safe `Content-Disposition` header with both `filename` and `filename*`, are served inline for in-app preview, and carry `X-Content-Type-Options: nosniff` so the browser can't MIME-sniff one into executable HTML.

## Realtime

`GET /api/sync` returns visible cursors for activity, messages, nudges, and friend requests, plus unread counts for messages, activity, nudges, requests, and the aggregate Balances badge — all in a single query (cursors computed in a CTE and reused by the unread expressions). The client polls every 4s (16s when the tab is hidden) via `useSync`; when any cursor advances, affected views refetch and chat panes fetch messages `since` their last id. Activity and message scopes clear through `read_state`; nudges clear via `seen_at`; friend requests clear when accepted/declined/canceled. No websockets — reliable on serverless, no connection state to break.

## Chat

`messages` rows are either `group` (group_id) or `dm` (ordered user pair). Both endpoints support `since` incremental fetch and `q` substring search. Links render as anchors; everything else is plain text (React escapes by default). On mobile the Chat route takes the frame's whole region and never scrolls it, so the message list scrolls alone while search, composer, Send, and bottom navigation stay visible.

## Mobile PWA shell

The root viewport uses `viewport-fit=cover`. Mobile safe-area values become CSS variables in `src/app/globals.css`. The bottom navigation adds the iPhone inset plus a small lift.

On mobile the app is a locked frame rather than a scrolling document. `.app-frame` covers the visible viewport, `.app-scroll` is the only region that scrolls (`.app-fixed` on Chat, which scrolls its own message list), and navigation is the frame's last row. The bar was `position: fixed; bottom: 0` before. iOS resolves that bottom edge differently depending on whether the document can scroll at all, so the bar sat in one place on routes that overflowed and another on routes that fit in one screen; in normal flow it has no viewport to drift against. The lock is scoped to `html:has(.app-frame)`, because login, signup, and recovery render outside the shell and need the document to scroll. The mobile navigation hides while the composer has focus.

No route renders a page title. A title row that differed per page is what made the header appear to change size between tabs, so each page's actions live in its content and `AppShell` takes a `title` for an `sr-only` heading. See `docs/PWA.md` for the verification contract.

`sw.js` is byte-identical between deploys, so `registration.update()` never installs a new worker, and the worker's other update route — diffing HTML on a navigation — needs a navigation that an iOS PWA restored from memory never makes. `ServiceWorkerRegistration` therefore polls `/api/version` and compares it with the `NEXT_PUBLIC_BUILD_ID` its own bundle was compiled from; on a mismatch it clears the page cache and the build's chunks, records the incoming version so the worker does not bounce the page a second time, and reloads once. A `sessionStorage` guard keyed on the version stops a reload loop if the new build never lands.

## Recurring expenses

`recurring_expenses` hold a template + `next_date`. When a group page is loaded, `materializeRecurring` creates concrete expenses for every elapsed period (capped at 24 per call so a long-dormant rule defers rather than skips periods) and advances `next_date` — no cron needed. Each period's `next_date` advance and the generated expense insert happen in one SQL statement, so process death can't claim a period without writing it. The Neon driver returns Postgres `DATE` columns as JS `Date` objects, so `materializeRecurring` normalizes them to a calendar `YYYY-MM-DD` string (`toYmd`) before any date math — a naive `String(date).slice(0,10)` yields a locale string and crashes the materializer.

## Theming

The design system is codified in `.interface-design/system.md` and ships from two CSS token scopes. Tailwind design tokens live in `src/app/globals.css` under `@theme`. Runtime environment tokens, including safe-area values, live under `:root` so Tailwind cannot remove them. The direction is modern/clean/minimal — flat, cool-neutral surfaces (no texture), one sans typeface (Instrument Sans) for all UI and money with tabular figures, the serif (Fraunces) reserved only for the wordmark, and a restrained green accent with money semantics (`owed`/`owe`) kept distinct from the brand and from `danger`. Two palettes share the same token names: light is the default; dark is defined under `[data-theme="dark"]`, which overrides the `--color-*` tokens (and `--shadow-*`, skeleton) so every `bg-paper`/`text-ink`/`bg-accent` utility flips automatically — no per-component dark variants. In dark mode cards lift above the canvas (depth comes from a surface-lightness step, not shadows). Accent and danger backgrounds use dedicated `--color-on-accent` / `--color-on-danger` foreground tokens so text stays legible in both themes. `src/lib/theme.tsx` exposes `useTheme()` (toggle wired into the sidebar and Settings → Appearance) and `themeInitScript`, an inline `<head>` script that applies the saved theme (or the OS `prefers-color-scheme`) before first paint to avoid a flash. The choice persists in `localStorage`.

## Performance

Over the Neon HTTP driver every `sql` tagged-template is its own network round-trip, so read paths are shaped to minimize both round-trips and full-table scans:

- The hot money tables carry secondary indexes (see `docs/DATABASE.md`), so `group_balance_rows()` index-scans one group instead of sequentially scanning all expenses/settlements.
- The dashboard group list folds each group's balance into one `LEFT JOIN LATERAL group_balance_rows()` query (no per-group N+1); `/api/sync` is a single query; `/api/friends`, `/api/conversations`, and the person profile run their mutually-independent reads with `Promise.all`.
- List endpoints (expenses, settlements) are capped at 200 rows, and malformed numeric query params are ignored rather than turned into errors.

## Deployment

Vercel serverless. Neon over HTTP (`@neondatabase/serverless`), so write paths prefer single-statement CTEs where atomicity matters and otherwise order writes so a mid-sequence failure leaves either a complete record or a cleanly absent one. Run `scripts/migrate.ts` before deploying new code (it is idempotent and ledger-gated; the code depends on columns/indexes it adds).
