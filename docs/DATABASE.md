# Database (Neon PostgreSQL)

## Migration

`scripts/migrate.ts` is idempotent — tables, columns, indexes, and constraints use
`IF NOT EXISTS` / guarded `DO` blocks, and one-time data fixups (username / category
/ friend-request dedupe, anchor-day backfill) are gated through the
`schema_migrations` ledger so they run exactly once instead of re-scanning and
locking the full tables on every deploy. Indexes are built plain (fine at this
scale); on an already-large table, build the money-table indexes with
`CREATE INDEX CONCURRENTLY` out of band instead.

```bash
DATABASE_URL=... pnpm tsx scripts/migrate.ts
```

**Run the migration before deploying the code** — `getSessionUser` references
`users.deleted_at`, which the migration adds.

## Tables

| Table | Purpose |
|---|---|
| `users` | username (unique, lowercase), display name, scrypt hash, personal invite code; `deleted_at` soft-delete tombstone (filtered out of auth) |
| `sessions` | auth tokens with expiry |
| `schema_migrations` | ledger of applied one-time data-fixup migrations (`name` → `applied_at`) |
| `friendships` | unordered user pairs (`user_a < user_b`) |
| `groups` | name, currency, invite code |
| `group_members` | membership |
| `categories` | built-in (`owner_id IS NULL`) + per-user custom |
| `expenses` | amount in original currency + `converted_cents` in group currency with `fx_rate` snapshot, split method, payer, category, date, notes |
| `expense_shares` | per-participant integer-cent shares (always sum to `amount_cents`, DB-enforced by a deferred sum-check trigger), raw input (percent/shares/exact) for editing |
| `expense_items` | itemized-bill line items with participant id arrays |
| `attachments` | receipts stored as `bytea` (≤ 4 MB, images/PDF) |
| `settlements` | offline payment ledger; `group_id NULL` = direct friend settlement |
| `recurring_expenses` | templates with cadence + `next_date`, lazily materialized |
| `activity` | append-only log rows shown in activity feeds |
| `messages` | group chat (`group_id`) or DM (`dm_a < dm_b`) |
| `fx_rates` | cached currency rates (units per USD), refreshed daily from open.er-api.com with static fallback |
| `recovery_codes` | one-time account-recovery codes, scrypt-hashed; `used_at` marks a spent code |
| `expense_comments` | per-expense comment threads |
| `read_state` | per-user read cursors keyed by `scope` (`activity`, `msg:group:<id>`, `msg:dm:<friendId>`); clears activity/message unread badges |
| `nudges` | settle-up reminders from one user to another (optionally group-scoped); max unseen id is a sync cursor and `seen_at` dismisses |
| `friend_requests` | pending friend requests (`from_id` → `to_id`); max incoming id is a sync cursor, and accepting/declining/canceling clears request badges |

## Conventions

- Money is always integer cents (`BIGINT`); never floats.
- Dates are `DATE` for business dates, `TIMESTAMPTZ` for event times.
- Cascading deletes: removing an expense removes its shares/items/attachments; removing a group removes its expenses, members, messages, activity. User-referencing money FKs intentionally use the default `NO ACTION` (RESTRICT-like) — never cascade — so a user can't be hard-deleted out from under settled balances; erasure goes through `deleted_at`.
- The Neon HTTP driver returns `BIGINT` as strings and `bytea` as `\x`-hex; API routes normalize with `Number(...)` / hex decode.
- Attachment filenames are stored only after header/path sanitization; download responses still sanitize again before emitting `Content-Disposition`.

## Indexes & balance function

- Secondary indexes back the hot read paths: `expenses(group_id)` and `settlements(group_id/payer_id/recipient_id)` feed `group_balance_rows()`; `group_members(user_id)` and `friendships(user_b)` serve the reverse lookups in the sidebar, sync poller, and relationship checks; `attachments(expense_id)` and partial `expenses(recurring_id)` cover the remaining FK joins. Below these, every table has only its primary key.
- `group_balance_rows(group_id)` returns each member's net (paid − owed + settlements paid − received). The owed side allocates every expense's `converted_cents` across its shares with a **per-expense largest-remainder** pass using exact integer `div`/`mod`, so converted shares sum exactly to the expense total and no cross-currency rounding residual is misattributed to one member. A whole-group residual-absorption step remains as a defensive backstop (now a no-op in the common case).
- `expenses.recurring_id` has an FK to `recurring_expenses(id)` (`ON DELETE SET NULL`) so already-materialized expenses survive a rule deletion.
- Zero-decimal currencies (JPY/KRW) are stored as whole units (multiples of 100 cents) and split in whole units, so a share is never an unpayable fraction of a yen/won.
