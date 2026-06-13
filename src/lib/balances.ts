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
  const pairTotals = new Map<string, number>(); // `${friendId}:${currency}` -> signed cents

  // The shared-group balances and the direct (group-less) settlements are
  // independent reads — run them as one parallel level instead of a serial
  // waterfall over the Neon HTTP driver.
  const [groupRows, direct] = await Promise.all([
    sql`
    WITH relevant_groups AS (
      SELECT g.id, g.currency
      FROM groups g
      WHERE EXISTS (
        SELECT 1 FROM group_members me
        WHERE me.group_id = g.id AND me.user_id = ${userId}
      )
      AND (${onlyFriendId ?? null}::bigint IS NULL OR EXISTS (
        SELECT 1 FROM group_members them
        WHERE them.group_id = g.id AND them.user_id = ${onlyFriendId ?? null}
      ))
    )
    SELECT rg.id AS group_id, rg.currency, b.user_id, b.display_name, b.net_cents AS net
    FROM relevant_groups rg
    CROSS JOIN LATERAL group_balance_rows(rg.id) b
    ORDER BY rg.id, b.display_name, b.user_id`,
    sql`
    SELECT payer_id, recipient_id, currency, SUM(converted_cents) AS amt
    FROM settlements
    WHERE group_id IS NULL
      AND (payer_id = ${userId} OR recipient_id = ${userId})
      AND (${onlyFriendId ?? null}::bigint IS NULL OR payer_id = ${onlyFriendId ?? null} OR recipient_id = ${onlyFriendId ?? null})
    GROUP BY payer_id, recipient_id, currency`,
  ]);

  const byGroup = new Map<number, { currency: string; balances: MemberBalance[] }>();
  for (const row of groupRows) {
    const groupId = Number(row.group_id);
    const group = byGroup.get(groupId) ?? { currency: row.currency as string, balances: [] as MemberBalance[] };
    group.balances.push({
      userId: Number(row.user_id),
      displayName: row.display_name,
      netCents: Number(row.net),
    });
    byGroup.set(groupId, group);
  }

  for (const g of byGroup.values()) {
    for (const t of simplifyDebts(new Map(g.balances.map((b) => [b.userId, b.netCents])))) {
      if (t.from === userId && (!onlyFriendId || t.to === onlyFriendId)) {
        const key = `${t.to}:${g.currency}`;
        pairTotals.set(key, (pairTotals.get(key) ?? 0) - t.amountCents);
      } else if (t.to === userId && (!onlyFriendId || t.from === onlyFriendId)) {
        const key = `${t.from}:${g.currency}`;
        pairTotals.set(key, (pairTotals.get(key) ?? 0) + t.amountCents);
      }
    }
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

export async function isGroupMember(groupId: number, userId: number): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}`;
  return rows.length > 0;
}

export async function loadGroupMemberIds(groupId: number): Promise<Set<number>> {
  const rows = await sql`SELECT user_id FROM group_members WHERE group_id = ${groupId}`;
  return new Set(rows.map((r) => Number(r.user_id)));
}
