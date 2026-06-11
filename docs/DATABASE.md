# Database (Neon PostgreSQL)

## Migration

`scripts/migrate.ts` is idempotent (`CREATE TABLE IF NOT EXISTS`). Run with:

```bash
DATABASE_URL=... pnpm tsx scripts/migrate.ts
```

## Tables

| Table | Purpose |
|---|---|
| `users` | username (unique, lowercase), display name, scrypt hash, personal invite code |
| `sessions` | auth tokens with expiry |
| `friendships` | unordered user pairs (`user_a < user_b`) |
| `groups` | name, currency, invite code |
| `group_members` | membership |
| `categories` | built-in (`owner_id IS NULL`) + per-user custom |
| `expenses` | amount in original currency + `converted_cents` in group currency with `fx_rate` snapshot, split method, payer, category, date, notes |
| `expense_shares` | per-participant integer-cent shares (always sum to `amount_cents`), raw input (percent/shares/exact) for editing |
| `expense_items` | itemized-bill line items with participant id arrays |
| `attachments` | receipts stored as `bytea` (≤ 4 MB, images/PDF) |
| `settlements` | offline payment ledger; `group_id NULL` = direct friend settlement |
| `recurring_expenses` | templates with cadence + `next_date`, lazily materialized |
| `activity` | append-only log rows shown in activity feeds |
| `messages` | group chat (`group_id`) or DM (`dm_a < dm_b`) |
| `fx_rates` | cached currency rates (units per USD), refreshed daily from open.er-api.com with static fallback |
| `recovery_codes` | one-time account-recovery codes, scrypt-hashed; `used_at` marks a spent code |
| `expense_comments` | per-expense comment threads |
| `read_state` | per-user read cursors keyed by `scope` (`activity`, `msg:group:<id>`, `msg:dm:<friendId>`); drives unread badges |
| `nudges` | settle-up reminders from one user to another (optionally group-scoped); `seen_at` dismisses |
| `friend_requests` | pending friend requests (`from_id` → `to_id`); accepting creates a `friendships` row |

## Conventions

- Money is always integer cents (`BIGINT`); never floats.
- Dates are `DATE` for business dates, `TIMESTAMPTZ` for event times.
- Cascading deletes: removing an expense removes its shares/items/attachments; removing a group removes its expenses, members, messages, activity.
- The Neon HTTP driver returns `BIGINT` as strings and `bytea` as `\x`-hex; API routes normalize with `Number(...)` / hex decode.
