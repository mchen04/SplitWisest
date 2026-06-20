import { sql } from "./db";
import { simplifyDebts, Transfer } from "./money";

// All balance math uses converted_cents (the expense amount converted to the
// group's currency at entry time). Settlements likewise.

export interface MemberBalance {
  userId: number;
  displayName: string;
  netCents: number; // positive = is owed, negative = owes
}

export async function groupBalances(groupId: number): Promise<MemberBalance[]> {
  const rows = await sql`
    SELECT user_id, display_name, net_cents
    FROM group_balance_rows(${groupId})
    ORDER BY display_name, user_id`;
  return rows.map((r) => ({
    userId: Number(r.user_id),
    displayName: r.display_name,
    netCents: Number(r.net_cents),
  }));
}

export function suggestSettlements(balances: MemberBalance[]): Transfer[] {
  return simplifyDebts(new Map(balances.map((b) => [b.userId, b.netCents])));
}

// True pairwise balance between the viewer and each co-member, across all shared
// groups plus direct (group-less) settlements, reported as a per-currency net.
// This is the REAL two-party balance — what each pair directly owes each other —
// NOT a group-wide simplified settle-up plan. Using the simplified plan here
// (largest debtor ↔ largest creditor) would both invent debts to a third party
// the viewer never transacted with and, when the viewer's group net happens to be
// zero, hide a real debt to one friend that is offset by a credit from another.
// The group page's "suggested settle-up" still uses simplifyDebts — that is the
// correct place for a transaction-minimizing plan.
export interface FriendBalance {
  friendId: number;
  displayName: string;
  username: string;
  // positive: friend owes me; negative: I owe friend. Keyed by currency.
  netByCurrency: Record<string, number>;
}

async function accumulatePairBalances(userId: number, onlyFriendId?: number): Promise<Map<number, Record<string, number>>> {
  const friendFilter = onlyFriendId ?? null;
  const pairTotals = new Map<string, number>(); // `${friendId}:${currency}` -> signed cents

  // Group portion and direct (group-less) settlements are independent reads — run
  // them as one parallel level instead of a serial waterfall over the Neon driver.
  // Group portion: for every expense in a shared group, allocate converted_cents
  // across its shares with the SAME per-expense largest-remainder pass that
  // group_balance_rows uses (exact integer div()/mod()), so converted shares sum
  // exactly to converted_cents. Then the viewer↔other net is: if the viewer paid,
  // each other participant owes the viewer their converted share; if someone else
  // paid and the viewer has a share, the viewer owes that payer their share. Group
  // settlements between the pair net in the group currency.
  const [groupRows, direct] = await Promise.all([
    sql`
    WITH my_groups AS (
      SELECT g.id AS group_id, g.currency
      FROM group_members me
      JOIN groups g ON g.id = me.group_id
      WHERE me.user_id = ${userId}
        AND (${friendFilter}::bigint IS NULL OR EXISTS (
          SELECT 1 FROM group_members them
          WHERE them.group_id = g.id AND them.user_id = ${friendFilter}
        ))
    ),
    relevant_exp AS (
      SELECT e.id, e.payer_id, e.converted_cents, e.amount_cents, mg.currency AS group_currency
      FROM expenses e
      JOIN my_groups mg ON mg.group_id = e.group_id
    ),
    alloc AS (
      SELECT es.expense_id, es.user_id, re.payer_id, re.group_currency,
        div(es.share_cents::numeric * re.converted_cents, re.amount_cents) AS floor_cents,
        mod(es.share_cents::numeric * re.converted_cents, re.amount_cents) AS remainder,
        re.converted_cents AS exp_converted
      FROM expense_shares es
      JOIN relevant_exp re ON re.id = es.expense_id
    ),
    ranked AS (
      SELECT a.expense_id, a.user_id, a.payer_id, a.group_currency, a.floor_cents,
        a.exp_converted - sum(a.floor_cents) OVER (PARTITION BY a.expense_id) AS leftover,
        row_number() OVER (PARTITION BY a.expense_id ORDER BY a.remainder DESC, a.user_id) AS rr
      FROM alloc a
    ),
    share_alloc AS (
      SELECT expense_id, user_id, payer_id, group_currency,
        (floor_cents + CASE WHEN rr <= leftover THEN 1 ELSE 0 END)::bigint AS converted_share
      FROM ranked
    ),
    exp_pairs AS (
      SELECT sa.user_id AS friend_id, sa.group_currency AS currency, sa.converted_share AS net
      FROM share_alloc sa
      WHERE sa.payer_id = ${userId} AND sa.user_id <> ${userId}
      UNION ALL
      SELECT sa.payer_id AS friend_id, sa.group_currency AS currency, -sa.converted_share AS net
      FROM share_alloc sa
      WHERE sa.user_id = ${userId} AND sa.payer_id <> ${userId}
    ),
    grp_settle AS (
      SELECT CASE WHEN s.payer_id = ${userId} THEN s.recipient_id ELSE s.payer_id END AS friend_id,
        mg.currency,
        CASE WHEN s.payer_id = ${userId} THEN s.converted_cents ELSE -s.converted_cents END AS net
      FROM settlements s
      JOIN my_groups mg ON mg.group_id = s.group_id
      WHERE s.payer_id = ${userId} OR s.recipient_id = ${userId}
    ),
    combined AS (
      SELECT friend_id, currency, net FROM exp_pairs
      UNION ALL
      SELECT friend_id, currency, net FROM grp_settle
    )
    SELECT friend_id, currency, SUM(net)::bigint AS net_cents
    FROM combined
    WHERE (${friendFilter}::bigint IS NULL OR friend_id = ${friendFilter})
    GROUP BY friend_id, currency`,
    sql`
    SELECT payer_id, recipient_id, currency, SUM(converted_cents) AS amt
    FROM settlements
    WHERE group_id IS NULL
      AND (payer_id = ${userId} OR recipient_id = ${userId})
      AND (${friendFilter}::bigint IS NULL OR payer_id = ${friendFilter} OR recipient_id = ${friendFilter})
    GROUP BY payer_id, recipient_id, currency`,
  ]);

  for (const row of groupRows) {
    const key = `${Number(row.friend_id)}:${row.currency}`;
    pairTotals.set(key, (pairTotals.get(key) ?? 0) + Number(row.net_cents));
  }

  for (const s of direct) {
    const friendId = Number(s.payer_id) === userId ? Number(s.recipient_id) : Number(s.payer_id);
    const signed = Number(s.payer_id) === userId ? Number(s.amt) : -Number(s.amt);
    const key = `${friendId}:${s.currency}`;
    pairTotals.set(key, (pairTotals.get(key) ?? 0) + signed);
  }

  const balances = new Map<number, Record<string, number>>();
  for (const [key, amt] of pairTotals) {
    if (amt === 0) continue;
    const idx = key.indexOf(":");
    const friendId = Number(key.slice(0, idx));
    const cur = key.slice(idx + 1);
    const netByCurrency = balances.get(friendId) ?? {};
    netByCurrency[cur] = (netByCurrency[cur] ?? 0) + amt;
    if (netByCurrency[cur] === 0) delete netByCurrency[cur];
    balances.set(friendId, netByCurrency);
  }
  for (const [friendId, netByCurrency] of balances) {
    if (Object.keys(netByCurrency).length === 0) balances.delete(friendId);
  }
  return balances;
}

export async function friendBalances(userId: number): Promise<FriendBalance[]> {
  const pairBalances = await accumulatePairBalances(userId);
  const friendIds = [...pairBalances.keys()];
  if (friendIds.length === 0) return [];
  const users = await sql`SELECT id, display_name, username FROM users WHERE id = ANY(${friendIds})`;
  return users.map((u) => ({
    friendId: Number(u.id),
    displayName: u.display_name,
    username: u.username,
    netByCurrency: pairBalances.get(Number(u.id)) ?? {},
  }));
}

export async function pairwiseFriendBalance(userId: number, friendId: number): Promise<Record<string, number>> {
  return (await accumulatePairBalances(userId, friendId)).get(friendId) ?? {};
}

export async function isGroupMember(groupId: number, userId: number): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}`;
  return rows.length > 0;
}

export async function loadGroupMemberIds(groupId: number): Promise<Set<number>> {
  const rows = await sql`SELECT user_id FROM group_members WHERE group_id = ${groupId}`;
  return new Set(rows.map((r) => Number(r.user_id)));
}
