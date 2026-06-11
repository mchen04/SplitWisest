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
  const rows = await sql`
    WITH pair_expense AS (
      -- what each share-holder owes the payer, per expense, in group currency
      SELECT e.payer_id AS creditor, es.user_id AS debtor, g.currency,
        CASE WHEN e.amount_cents = 0 THEN 0
          ELSE ROUND(es.share_cents::numeric * e.converted_cents / e.amount_cents) END AS amt
      FROM expense_shares es
      JOIN expenses e ON e.id = es.expense_id
      JOIN groups g ON g.id = e.group_id
      WHERE es.user_id <> e.payer_id
    ),
    pair_settle AS (
      SELECT s.recipient_id AS creditor, s.payer_id AS debtor,
        COALESCE(g.currency, s.currency) AS currency,
        -s.converted_cents AS amt
      FROM settlements s LEFT JOIN groups g ON g.id = s.group_id
    ),
    all_pairs AS (
      SELECT * FROM pair_expense UNION ALL SELECT * FROM pair_settle
    ),
    nets AS (
      SELECT creditor, debtor, currency, SUM(amt) AS amt FROM all_pairs
      WHERE creditor = ${userId} OR debtor = ${userId}
      GROUP BY creditor, debtor, currency
    )
    SELECT n.creditor, n.debtor, n.currency, n.amt,
           u.display_name, u.username, u.id AS friend_id
    FROM nets n
    JOIN users u ON u.id = CASE WHEN n.creditor = ${userId} THEN n.debtor ELSE n.creditor END`;

  const map = new Map<number, FriendBalance>();
  for (const r of rows) {
    const fid = Number(r.friend_id);
    let fb = map.get(fid);
    if (!fb) {
      fb = { friendId: fid, displayName: r.display_name, username: r.username, netByCurrency: {} };
      map.set(fid, fb);
    }
    const signed = Number(r.creditor) === userId ? Number(r.amt) : -Number(r.amt);
    fb.netByCurrency[r.currency] = (fb.netByCurrency[r.currency] ?? 0) + signed;
  }
  for (const fb of map.values()) {
    for (const [cur, amt] of Object.entries(fb.netByCurrency)) {
      if (amt === 0) delete fb.netByCurrency[cur];
    }
  }
  return [...map.values()];
}

export async function isGroupMember(groupId: number, userId: number): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}`;
  return rows.length > 0;
}
