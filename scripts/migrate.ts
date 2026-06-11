import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS friendships (
    user_a BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_a, user_b),
    CHECK (user_a < user_b)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS groups (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    invite_code TEXT UNIQUE NOT NULL,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS group_members (
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'tag',
    owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (owner_id, name)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS expenses (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL,
    converted_cents BIGINT NOT NULL CHECK (converted_cents > 0),
    fx_rate NUMERIC NOT NULL DEFAULT 1,
    expense_date DATE NOT NULL,
    payer_id BIGINT NOT NULL REFERENCES users(id),
    category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    notes TEXT NOT NULL DEFAULT '',
    split_method TEXT NOT NULL CHECK (split_method IN ('equal','exact','percentage','shares','itemized')),
    recurring_id BIGINT,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS expense_shares (
    expense_id BIGINT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    share_cents BIGINT NOT NULL CHECK (share_cents >= 0),
    raw_input NUMERIC,
    PRIMARY KEY (expense_id, user_id)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS expense_items (
    id BIGSERIAL PRIMARY KEY,
    expense_id BIGINT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
    participant_ids BIGINT[] NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS attachments (
    id BIGSERIAL PRIMARY KEY,
    expense_id BIGINT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS settlements (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
    payer_id BIGINT NOT NULL REFERENCES users(id),
    recipient_id BIGINT NOT NULL REFERENCES users(id),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL,
    converted_cents BIGINT NOT NULL CHECK (converted_cents > 0),
    settled_date DATE NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (payer_id <> recipient_id)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS recurring_expenses (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL,
    payer_id BIGINT NOT NULL REFERENCES users(id),
    category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    participant_ids BIGINT[] NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    cadence TEXT NOT NULL CHECK (cadence IN ('weekly','monthly')),
    next_date DATE NOT NULL,
    anchor_day INT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await sql`ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS anchor_day INT`;

  await sql`CREATE TABLE IF NOT EXISTS activity (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
    actor_id BIGINT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    summary TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS activity_group_idx ON activity (group_id, id)`;

  await sql`CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    channel TEXT NOT NULL CHECK (channel IN ('group','dm')),
    group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
    dm_a BIGINT REFERENCES users(id) ON DELETE CASCADE,
    dm_b BIGINT REFERENCES users(id) ON DELETE CASCADE,
    sender_id BIGINT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
      (channel = 'group' AND group_id IS NOT NULL) OR
      (channel = 'dm' AND dm_a IS NOT NULL AND dm_b IS NOT NULL AND dm_a < dm_b)
    )
  )`;
  await sql`CREATE INDEX IF NOT EXISTS messages_group_idx ON messages (group_id, id)`;
  await sql`CREATE INDEX IF NOT EXISTS messages_dm_idx ON messages (dm_a, dm_b, id)`;

  await sql`CREATE TABLE IF NOT EXISTS fx_rates (
    currency TEXT PRIMARY KEY,
    rate_per_usd NUMERIC NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  // One-time account recovery codes. Each code is scrypt-hashed (never stored
  // plaintext) and single-use; spending one stamps used_at.
  await sql`CREATE TABLE IF NOT EXISTS recovery_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS recovery_codes_user_idx ON recovery_codes (user_id)`;

  // Per-expense comment threads (Splitwise-style discussion on a single bill).
  await sql`CREATE TABLE IF NOT EXISTS expense_comments (
    id BIGSERIAL PRIMARY KEY,
    expense_id BIGINT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS expense_comments_idx ON expense_comments (expense_id, id)`;

  // Per-user read cursors. `scope` is a string like 'activity',
  // 'msg:group:<id>', or 'msg:dm:<friendId>'; last_id is the highest id the
  // user has seen in that scope. Drives unread badges.
  await sql`CREATE TABLE IF NOT EXISTS read_state (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    last_id BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, scope)
  )`;

  // Settle-up nudges. A reminder from one user to another (optionally scoped to
  // a group) to settle an outstanding balance. Surfaces as the recipient's
  // notification until they dismiss it (seen_at).
  await sql`CREATE TABLE IF NOT EXISTS nudges (
    id BIGSERIAL PRIMARY KEY,
    from_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
    note TEXT NOT NULL DEFAULT '',
    seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS nudges_to_idx ON nudges (to_id, id)`;

  // Pending friend requests. Adding a friend by code now creates a request the
  // recipient accepts or declines, instead of an instant two-way friendship.
  await sql`CREATE TABLE IF NOT EXISTS friend_requests (
    id BIGSERIAL PRIMARY KEY,
    from_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_id, to_id),
    CHECK (from_id <> to_id)
  )`;

  // Dedupe global categories: UNIQUE(owner_id, name) does not constrain rows
  // where owner_id IS NULL (NULLs are distinct in Postgres), so non-idempotent
  // seeds accumulated duplicates. Repoint references to the lowest id per name,
  // delete the rest, then enforce uniqueness with a partial index.
  await sql`
    UPDATE expenses e SET category_id = k.keep_id FROM (
      SELECT name, min(id) AS keep_id FROM categories WHERE owner_id IS NULL GROUP BY name
    ) k JOIN categories c ON c.name = k.name AND c.owner_id IS NULL
    WHERE e.category_id = c.id AND e.category_id <> k.keep_id`;
  await sql`
    UPDATE recurring_expenses e SET category_id = k.keep_id FROM (
      SELECT name, min(id) AS keep_id FROM categories WHERE owner_id IS NULL GROUP BY name
    ) k JOIN categories c ON c.name = k.name AND c.owner_id IS NULL
    WHERE e.category_id = c.id AND e.category_id <> k.keep_id`;
  await sql`
    DELETE FROM categories c WHERE c.owner_id IS NULL AND c.id <> (
      SELECT min(id) FROM categories c2 WHERE c2.owner_id IS NULL AND c2.name = c.name
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS categories_global_name_idx
    ON categories (name) WHERE owner_id IS NULL`;

  await sql`INSERT INTO categories (name, icon, owner_id) VALUES
    ('General','tag',NULL),
    ('Food & Drink','utensils',NULL),
    ('Groceries','shopping-cart',NULL),
    ('Rent','home',NULL),
    ('Utilities','zap',NULL),
    ('Travel','plane',NULL),
    ('Transport','car',NULL),
    ('Entertainment','clapperboard',NULL),
    ('Shopping','shopping-bag',NULL),
    ('Health','heart-pulse',NULL)
    ON CONFLICT DO NOTHING`;

  console.log("migration complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
