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
    WITH members AS (
      SELECT u.id, u.display_name FROM group_members gm JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ${groupId}
    ),
    paid AS (
      SELECT payer_id AS uid, COALESCE(SUM(converted_cents),0) AS amt
      FROM expenses WHERE group_id = ${groupId} GROUP BY payer_id
    ),
    owed AS (
      SELECT es.user_id AS uid, COALESCE(SUM(
        CASE WHEN e.amount_cents = 0 THEN 0
        ELSE ROUND(es.share_cents::numeric * e.converted_cents / e.amount_cents) END
      ),0) AS amt
      FROM expense_shares es JOIN expenses e ON e.id = es.expense_id
      WHERE e.group_id = ${groupId} GROUP BY es.user_id
    ),
    settled_out AS (
      SELECT payer_id AS uid, COALESCE(SUM(converted_cents),0) AS amt
      FROM settlements WHERE group_id = ${groupId} GROUP BY payer_id
    ),
    settled_in AS (
      SELECT recipient_id AS uid, COALESCE(SUM(converted_cents),0) AS amt
      FROM settlements WHERE group_id = ${groupId} GROUP BY recipient_id
    )
    SELECT m.id, m.display_name,
      COALESCE(p.amt,0) - COALESCE(o.amt,0) + COALESCE(so.amt,0) - COALESCE(si.amt,0) AS net
    FROM members m
    LEFT JOIN paid p ON p.uid = m.id
    LEFT JOIN owed o ON o.uid = m.id
    LEFT JOIN settled_out so ON so.uid = m.id
    LEFT JOIN settled_in si ON si.uid = m.id
    ORDER BY m.display_name`;
  const balances = rows.map((r) => ({
    userId: Number(r.id),
    displayName: r.display_name,
    netCents: Number(r.net),
  }));
  // Rounding during currency conversion of shares can leave a few stray cents
  // so that nets don't sum to zero. Absorb the drift into the largest balance.
  const drift = balances.reduce((s, b) => s + b.netCents, 0);
  if (drift !== 0 && balances.length > 0) {
    const target = balances.reduce((a, b) => (Math.abs(b.netCents) > Math.abs(a.netCents) ? b : a));
    target.netCents -= drift;
  }
  return balances;
}

export function suggestSettlements(balances: MemberBalance[]): Transfer[] {
  return simplifyDebts(new Map(balances.map((b) => [b.userId, b.netCents])));
}

// Pairwise balance between two friends across all shared groups plus direct
// (group-less) settlements, expressed in each group's currency converted in
// group currency... To keep it simple and correct we report per-currency nets.
export interface FriendBalance {
  friendId: number;
  displayName: string;
  username: string;
  // positive: friend owes me; negative: I owe friend. Keyed by currency.
  netByCurrency: Record<string, number>;
}

export async function friendBalances(userId: number): Promise<FriendBalance[]> {
  // Per-group friend debts are derived from the SAME net balances and greedy
  // simplification that power the group's "suggested settle-up", so the
  // friends screen always agrees with what the app told people to pay.
  const groups = await sql`
    SELECT g.id, g.currency FROM groups g
    JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ${userId}`;

  const pairTotals = new Map<string, number>(); // `${friendId}:${currency}` -> signed cents
  for (const g of groups) {
    const balances = await groupBalances(Number(g.id));
    for (const t of simplifyDebts(new Map(balances.map((b) => [b.userId, b.netCents])))) {
      if (t.from === userId) {
        const key = `${t.to}:${g.currency}`;
        pairTotals.set(key, (pairTotals.get(key) ?? 0) - t.amountCents);
      } else if (t.to === userId) {
        const key = `${t.from}:${g.currency}`;
        pairTotals.set(key, (pairTotals.get(key) ?? 0) + t.amountCents);
      }
    }
  }

  // Direct (group-less) settlements adjust pairwise nets in their own currency.
  const direct = await sql`
    SELECT payer_id, recipient_id, currency, SUM(converted_cents) AS amt
    FROM settlements WHERE group_id IS NULL AND (payer_id = ${userId} OR recipient_id = ${userId})
    GROUP BY payer_id, recipient_id, currency`;
  for (const s of direct) {
    const friendId = Number(s.payer_id) === userId ? Number(s.recipient_id) : Number(s.payer_id);
    // friend paid me -> their debt to me shrinks (negative for me); I paid -> grows
    const signed = Number(s.payer_id) === userId ? Number(s.amt) : -Number(s.amt);
    const key = `${friendId}:${s.currency}`;
    pairTotals.set(key, (pairTotals.get(key) ?? 0) + signed);
  }

  const friendIds = [...new Set([...pairTotals.keys()].map((k) => Number(k.split(":")[0])))];
  if (friendIds.length === 0) return [];
  const users = await sql`SELECT id, display_name, username FROM users WHERE id = ANY(${friendIds})`;
  const map = new Map<number, FriendBalance>();
  for (const u of users) {
    map.set(Number(u.id), {
      friendId: Number(u.id),
      displayName: u.display_name,
      username: u.username,
      netByCurrency: {},
    });
  }
  for (const [key, amt] of pairTotals) {
    if (amt === 0) continue;
    const [fid, cur] = key.split(":");
    const fb = map.get(Number(fid));
    if (fb) fb.netByCurrency[cur] = (fb.netByCurrency[cur] ?? 0) + amt;
  }
  for (const fb of map.values()) {
    for (const [cur, amt] of Object.entries(fb.netByCurrency)) {
      if (amt === 0) delete fb.netByCurrency[cur];
    }
  }
  return [...map.values()];
}

export async function pairwiseFriendBalance(userId: number, friendId: number): Promise<Record<string, number>> {
  const pairTotals = new Map<string, number>();
  const groups = await sql`
    SELECT g.id, g.currency
    FROM groups g
    JOIN group_members me ON me.group_id = g.id AND me.user_id = ${userId}
    JOIN group_members them ON them.group_id = g.id AND them.user_id = ${friendId}`;

  for (const g of groups) {
    const balances = await groupBalances(Number(g.id));
    for (const t of simplifyDebts(new Map(balances.map((b) => [b.userId, b.netCents])))) {
      if (t.from === userId && t.to === friendId) {
        pairTotals.set(g.currency, (pairTotals.get(g.currency) ?? 0) - t.amountCents);
      } else if (t.from === friendId && t.to === userId) {
        pairTotals.set(g.currency, (pairTotals.get(g.currency) ?? 0) + t.amountCents);
      }
    }
  }

  const direct = await sql`
    SELECT payer_id, recipient_id, currency, SUM(converted_cents) AS amt
    FROM settlements
    WHERE group_id IS NULL
      AND ((payer_id = ${userId} AND recipient_id = ${friendId})
        OR (payer_id = ${friendId} AND recipient_id = ${userId}))
    GROUP BY payer_id, recipient_id, currency`;
  for (const s of direct) {
    const signed = Number(s.payer_id) === userId ? Number(s.amt) : -Number(s.amt);
    pairTotals.set(s.currency, (pairTotals.get(s.currency) ?? 0) + signed);
  }

  return Object.fromEntries([...pairTotals].filter(([, amount]) => amount !== 0));
}

export async function isGroupMember(groupId: number, userId: number): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}`;
  return rows.length > 0;
}

export async function loadGroupMemberIds(groupId: number): Promise<Set<number>> {
  const rows = await sql`SELECT user_id FROM group_members WHERE group_id = ${groupId}`;
  return new Set(rows.map((r) => Number(r.user_id)));
}
