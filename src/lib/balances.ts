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

async function accumulatePairBalances(userId: number, onlyFriendId?: number): Promise<Map<number, Record<string, number>>> {
  const groupFilter = onlyFriendId
    ? sql`JOIN group_members them ON them.group_id = g.id AND them.user_id = ${onlyFriendId}`
    : sql``;
  const groups = await sql`
    SELECT g.id, g.currency
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ${userId}
    ${groupFilter}`;
  const pairTotals = new Map<string, number>(); // `${friendId}:${currency}` -> signed cents

  for (const g of groups) {
    const balances = await groupBalances(Number(g.id));
    for (const t of simplifyDebts(new Map(balances.map((b) => [b.userId, b.netCents])))) {
      if (t.from === userId && (!onlyFriendId || t.to === onlyFriendId)) {
        const key = `${t.to}:${g.currency}`;
        pairTotals.set(key, (pairTotals.get(key) ?? 0) - t.amountCents);
      } else if (t.to === userId && (!onlyFriendId || t.from === onlyFriendId)) {
        const key = `${t.from}:${g.currency}`;
        pairTotals.set(key, (pairTotals.get(key) ?? 0) + t.amountCents);
      }
    }
  }

  const direct = await sql`
    SELECT payer_id, recipient_id, currency, SUM(converted_cents) AS amt
    FROM settlements
    WHERE group_id IS NULL
      AND (payer_id = ${userId} OR recipient_id = ${userId})
      AND (${onlyFriendId ?? null}::bigint IS NULL OR payer_id = ${onlyFriendId ?? null} OR recipient_id = ${onlyFriendId ?? null})
    GROUP BY payer_id, recipient_id, currency`;
  for (const s of direct) {
    const friendId = Number(s.payer_id) === userId ? Number(s.recipient_id) : Number(s.payer_id);
    const signed = Number(s.payer_id) === userId ? Number(s.amt) : -Number(s.amt);
    const key = `${friendId}:${s.currency}`;
    pairTotals.set(key, (pairTotals.get(key) ?? 0) + signed);
  }

  const balances = new Map<number, Record<string, number>>();
  for (const [key, amt] of pairTotals) {
    if (amt === 0) continue;
    const [fid, cur] = key.split(":");
    const friendId = Number(fid);
    const netByCurrency = balances.get(friendId) ?? {};
    netByCurrency[cur] = (netByCurrency[cur] ?? 0) + amt;
    if (netByCurrency[cur] === 0) delete netByCurrency[cur];
    balances.set(friendId, netByCurrency);
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

export async function friendshipExists(userId: number, friendId: number): Promise<boolean> {
  const [a, b] = friendId < userId ? [friendId, userId] : [userId, friendId];
  const rows = await sql`SELECT 1 FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
  return rows.length > 0;
}

export async function shareAnyGroup(userId: number, otherId: number): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM group_members me
    JOIN group_members them ON them.group_id = me.group_id AND them.user_id = ${otherId}
    WHERE me.user_id = ${userId}
    LIMIT 1`;
  return rows.length > 0;
}

export async function shareGroup(groupId: number, userId: number, otherId: number): Promise<boolean> {
  const rows = await sql`
    SELECT
      (SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}) AS me,
      (SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${otherId}) AS them`;
  return !!rows[0]?.me && !!rows[0]?.them;
}

export async function canNudgeUser(userId: number, toId: number, groupId: number | null): Promise<boolean> {
  return groupId ? shareGroup(groupId, userId, toId) : friendshipExists(userId, toId);
}

export async function canRequestFriendById(userId: number, friendId: number): Promise<boolean> {
  return userId !== friendId && await shareAnyGroup(userId, friendId) && !(await friendshipExists(userId, friendId));
}

export async function canSettleDirectly(userId: number, friendId: number): Promise<boolean> {
  return userId !== friendId && await friendshipExists(userId, friendId);
}

export async function canRemoveFriend(userId: number, friendId: number): Promise<boolean> {
  return await friendshipExists(userId, friendId)
    && Object.keys(await pairwiseFriendBalance(userId, friendId)).length === 0;
}

export async function isGroupMember(groupId: number, userId: number): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}`;
  return rows.length > 0;
}

export async function loadGroupMemberIds(groupId: number): Promise<Set<number>> {
  const rows = await sql`SELECT user_id FROM group_members WHERE group_id = ${groupId}`;
  return new Set(rows.map((r) => Number(r.user_id)));
}
